import io
import json
import math
import re
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.chart.axis import ChartLines
from openpyxl.chart.data_source import AxDataSource, StrData, StrRef, StrVal
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.line import LineProperties
from openpyxl.styles import Font, PatternFill
import httpx
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import get_actor
from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .logging_config import log_access, log_operation, log_request_error
from .models import Lifecycle, Project, ProjectAuditLog, ReferenceOption, utcnow
from .schemas import (
    Actor, AuditLogRead, BulkProjectDeleteRequest, Currency, LifecycleRequest, PaginatedProjects, ProjectCreate,
    ProjectRead, ProjectUpdate, ReferenceOptionCreate, ReferenceOptionRead,
    ReferenceOptionUpdate,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_reference_options(db)
    log_operation("service_start", "system", count=0, message=f"Backend service started; auth_mode={settings.auth_mode}.")
    yield


app = FastAPI(title=settings.app_name, version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    started = time.perf_counter()
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    log_access(request, response.status_code, (time.perf_counter() - started) * 1000)
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
    log_request_error(request, exc.status_code, detail.get("code", "HTTP_ERROR"), detail.get("message", "Request failed."))
    return JSONResponse(status_code=exc.status_code, content={
        "error": {"code": detail.get("code", "HTTP_ERROR"), "message": detail.get("message", "Request failed."), **{key: value for key, value in detail.items() if key not in {"code", "message"}}},
        "request_id": getattr(request.state, "request_id", None),
    })


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    fields = [{"field": ".".join(str(part) for part in item["loc"][1:]), "message": item["msg"]} for item in exc.errors()]
    log_request_error(request, 422, "VALIDATION_ERROR", f"Request validation failed for {len(fields)} field(s).")
    return JSONResponse(status_code=422, content={
        "error": {"code": "VALIDATION_ERROR", "message": "Please check the submitted values.", "fields": fields},
        "request_id": getattr(request.state, "request_id", None),
    })


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    log_request_error(request, 500, type(exc).__name__, "Unhandled server error.", exc=exc)
    return JSONResponse(status_code=500, content={
        "error": {"code": "INTERNAL_SERVER_ERROR", "message": "An unexpected server error occurred."},
        "request_id": getattr(request.state, "request_id", None),
    })


PROJECT_FIELD_NAMES = list(ProjectCreate.model_fields)
SORT_COLUMNS = {
    "created_at": Project.created_at,
    "updated_at": Project.updated_at,
    "ceg": Project.ceg,
    "budget": Project.budget,
    "estimated_closing_date": Project.estimated_closing_date,
    "priority": Project.project_priority,
}
PRIORITY_ORDER = case(
    (Project.project_priority == "High", 1),
    (Project.project_priority == "Medium", 2),
    (Project.project_priority == "Normal", 3),
    else_=4,
)


def json_value(value):
    if isinstance(value, (date, Decimal)):
        return str(value)
    return value


def project_read(project: Project) -> ProjectRead:
    data = {column.name: getattr(project, column.name) for column in Project.__table__.columns}
    data["is_overdue"] = bool(
        project.lifecycle == Lifecycle.active.value
        and project.estimated_closing_date
        and project.estimated_closing_date < date.today()
    )
    data["project_cycle_business_days"] = (
        business_days_between(project.pr_approved_date, project.po_release_date)
        if project.pr_approved_date and project.po_release_date and project.po_release_date >= project.pr_approved_date
        else None
    )
    return ProjectRead.model_validate(data)


def add_audit(db: Session, project: Project, action: str, changes: dict, actor: Actor):
    db.add(ProjectAuditLog(
        project_id=project.id,
        action=action,
        changes_json=json.dumps(changes, ensure_ascii=False, default=json_value),
        actor_id=actor.id,
        actor_name=actor.name,
    ))


REFERENCE_PROJECT_FIELDS = {
    "supplier_type": "supplier_type",
    "procurement_strategy": "procurement_strategy",
    "procurement_status": "procurement_status",
}


def validate_reference_values(db: Session, values: dict, previous: Project | None = None):
    for field, category in REFERENCE_PROJECT_FIELDS.items():
        value = values.get(field)
        if not value or (previous is not None and getattr(previous, field) == value):
            continue
        exists = db.scalar(select(func.count()).select_from(ReferenceOption).where(
            ReferenceOption.category == category,
            ReferenceOption.code == value,
            ReferenceOption.active.is_(True),
        ))
        if not exists:
            raise HTTPException(422, detail={"code": "INVALID_OPTION", "message": f"{field} is not an active option."})


def query_projects(
    lifecycle: str | None = None,
    priority: str | None = None,
    ceg: str | None = None,
    keyword: str | None = None,
    procurement_status: str | None = None,
    bu: str | None = None,
    requestor: str | None = None,
    pr_approved_from: date | None = None,
    pr_approved_to: date | None = None,
    closing_from: date | None = None,
    closing_to: date | None = None,
    overdue: bool | None = None,
):
    filters = [Project.deleted_at.is_(None)]
    if lifecycle:
        filters.append(Project.lifecycle == lifecycle)
    if priority:
        filters.append(Project.project_priority == priority)
    if ceg:
        filters.append(func.lower(Project.ceg).contains(ceg.strip().lower()))
    if keyword:
        term = f"%{keyword.strip().lower()}%"
        filters.append(or_(
            func.lower(Project.ceg).like(term), func.lower(Project.requestor).like(term),
            func.lower(Project.bu).like(term), func.lower(Project.description).like(term),
            func.lower(Project.supplier_name).like(term), func.lower(Project.procurement_status_notes).like(term),
        ))
    if procurement_status:
        filters.append(Project.procurement_status == procurement_status)
    if bu:
        filters.append(func.lower(Project.bu).contains(bu.strip().lower()))
    if requestor:
        filters.append(func.lower(Project.requestor).contains(requestor.strip().lower()))
    if pr_approved_from:
        filters.append(Project.pr_approved_date >= pr_approved_from)
    if pr_approved_to:
        filters.append(Project.pr_approved_date <= pr_approved_to)
    if closing_from:
        filters.append(Project.estimated_closing_date >= closing_from)
    if closing_to:
        filters.append(Project.estimated_closing_date <= closing_to)
    if overdue is True:
        filters.extend([
            Project.lifecycle == Lifecycle.active.value,
            Project.estimated_closing_date < date.today(),
        ])
    elif overdue is False:
        filters.append(or_(
            Project.lifecycle != Lifecycle.active.value,
            Project.estimated_closing_date.is_(None),
            Project.estimated_closing_date >= date.today(),
        ))
    return filters


def commit_or_conflict(db: Session, ceg_message: str = "CEG already exists."):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": "CEG_CONFLICT", "message": ceg_message}) from exc


def seed_reference_options(db: Session):
    defaults = {
        "supplier_type": [("Payment Only", "仅付款"), ("Simplified", "简化采购"), ("Sporadic", "零星采购"), ("Official", "正式供应商")],
        "procurement_strategy": [("Negotiation", "谈判"), ("Cost Comparison", "比价"), ("Bidding", "招标")],
        "procurement_status": [("Sourcing", "寻源"), ("Qualification", "资质审核"), ("Supplier Selection", "供应商选择"), ("Contract Review", "合同审核"), ("PO Release", "采购订单发布"), ("Others", "其他")],
    }
    for category, values in defaults.items():
        for index, (value, label_zh) in enumerate(values):
            exists = db.scalar(select(ReferenceOption.id).where(
                ReferenceOption.category == category,
                ReferenceOption.code == value,
            ))
            if not exists:
                db.add(ReferenceOption(category=category, code=value, label_en=value, label_zh=label_zh, sort_order=index))
    db.commit()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/session")
def session(actor: Actor = Depends(get_actor)):
    return {"actor": actor}


def parse_exchange_rate_response(
    payload: dict, from_currency: str, to_currency: str, rate_type: str,
) -> tuple[Decimal, datetime | None]:
    if str(payload.get("status")) != "200":
        raise ValueError("Exchange rate service returned an unsuccessful status.")
    data = payload.get("data")
    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, list) or not result:
        raise ValueError("Exchange rate service returned no quote.")

    expected_from = from_currency.upper()
    expected_to = to_currency.upper()
    expected_type = rate_type.upper()
    quote = next((item for item in result if isinstance(item, dict)
        and str(item.get("from_currency", "")).upper() == expected_from
        and str(item.get("to_currency", "")).upper() == expected_to
        and str(item.get("rate_type", "")).upper() == expected_type), None)
    if quote is None:
        raise ValueError("Exchange rate service returned no matching quote.")

    try:
        rate = Decimal(str(quote.get("rate_value")))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Exchange rate service returned an invalid rate.") from exc
    if not rate.is_finite() or rate <= 0:
        raise ValueError("Exchange rate service returned an invalid rate.")

    rate_date = quote.get("rate_date")
    quoted_at = None
    if rate_date:
        try:
            quoted_date = date.fromisoformat(str(rate_date).replace("/", "-"))
        except ValueError as exc:
            raise ValueError("Exchange rate service returned an invalid rate date.") from exc
        quoted_at = datetime(quoted_date.year, quoted_date.month, quoted_date.day, tzinfo=timezone.utc)
    return rate, quoted_at


@app.get("/api/exchange-rate")
def exchange_rate(request: Request, currency: Currency, actor: Actor = Depends(get_actor)):
    started = time.perf_counter()
    fetched_at = datetime.now(timezone.utc)
    if currency == "USD":
        log_operation("exchange_rate_lookup", actor.id, count=0, duration_ms=(time.perf_counter() - started) * 1000,
                      request_id=request.state.request_id, message="USD base exchange rate returned.")
        return {"currency": currency, "target_currency": "USD", "rate": "1.00000000", "fetched_at": fetched_at, "source": "USD base rate"}
    tenant_id = settings.exchange_rate_tenant_id.strip()
    rate_type = settings.exchange_rate_rate_type.strip()
    if not tenant_id or not rate_type:
        log_operation("exchange_rate_lookup", actor.id, result="not_configured", count=0,
                      duration_ms=(time.perf_counter() - started) * 1000, request_id=request.state.request_id,
                      message=f"Exchange rate lookup failed; currency={currency}.")
        raise HTTPException(503, detail={
            "code": "EXCHANGE_RATE_NOT_CONFIGURED",
            "message": "Exchange rate service is not configured.",
        })
    request_payload = {
        "tenant_id": tenant_id,
        "curPage": "1",
        "pageSize": "20",
        "multi_rate_type_flag": "Y",
        "data": [{
            "from_currency": currency,
            "to_currency": "USD",
            "rate_type": rate_type,
            "start_date": fetched_at.strftime("%Y/%m/%d"),
        }],
    }
    try:
        response = httpx.post(
            settings.exchange_rate_api_url,
            json=request_payload,
            follow_redirects=True,
            timeout=settings.exchange_rate_timeout_seconds,
        )
        response.raise_for_status()
        rate, quoted_at = parse_exchange_rate_response(response.json(), currency, "USD", rate_type)
    except (httpx.HTTPError, ValueError) as exc:
        log_operation("exchange_rate_lookup", actor.id, result=f"failed:{type(exc).__name__}", count=0,
                      duration_ms=(time.perf_counter() - started) * 1000, request_id=request.state.request_id,
                      message=f"Exchange rate lookup failed; currency={currency}.")
        raise HTTPException(502, detail={
            "code": "EXCHANGE_RATE_UNAVAILABLE",
            "message": "Exchange rate service is temporarily unavailable.",
        }) from exc
    log_operation("exchange_rate_lookup", actor.id, count=0, duration_ms=(time.perf_counter() - started) * 1000,
                  request_id=request.state.request_id, message=f"Exchange rate lookup succeeded; currency={currency}.")
    return {
        "currency": currency,
        "target_currency": "USD",
        "rate": str(rate),
        "fetched_at": quoted_at or fetched_at,
        "source": "Huawei iData Finance",
    }


@app.get("/api/projects", response_model=PaginatedProjects)
def list_projects(
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
    lifecycle: str | None = None, priority: str | None = None, ceg: str | None = None,
    keyword: str | None = None, procurement_status: str | None = None,
    bu: str | None = None, requestor: str | None = None,
    pr_approved_from: date | None = None, pr_approved_to: date | None = None,
    closing_from: date | None = None, closing_to: date | None = None,
    overdue: bool | None = None, sort: str = "priority", direction: str = "desc",
    db: Session = Depends(get_db), _actor: Actor = Depends(get_actor),
):
    filters = query_projects(lifecycle, priority, ceg, keyword, procurement_status, bu, requestor, pr_approved_from, pr_approved_to, closing_from, closing_to, overdue)
    total = db.scalar(select(func.count()).select_from(Project).where(*filters)) or 0
    if sort == "priority":
        ordering = (PRIORITY_ORDER.asc(), Project.updated_at.desc(), Project.id.desc())
    else:
        sort_column = SORT_COLUMNS.get(sort, Project.created_at)
        order = sort_column.asc() if direction == "asc" else sort_column.desc()
        ordering = (order, Project.id.desc())
    items = db.scalars(select(Project).where(*filters).order_by(*ordering).offset((page - 1) * page_size).limit(page_size)).all()
    return PaginatedProjects(items=[project_read(item) for item in items], total=total, page=page, page_size=page_size, pages=max(1, math.ceil(total / page_size)))


@app.get("/api/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, db: Session = Depends(get_db), _actor: Actor = Depends(get_actor)):
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Project not found."})
    return project_read(project)


@app.post("/api/projects", response_model=ProjectRead, status_code=201)
def create_project(payload: ProjectCreate, request: Request, db: Session = Depends(get_db), actor: Actor = Depends(get_actor)):
    values = payload.model_dump()
    validate_reference_values(db, values)
    if values.get("po_release_date") is not None:
        values["lifecycle"] = Lifecycle.completed.value
        values["completed_at"] = utcnow()
    project = Project(**values, created_by=actor.id, updated_by=actor.id)
    try:
        db.add(project)
        db.flush()
        add_audit(db, project, "created", {key: {"before": None, "after": json_value(value)} for key, value in values.items() if value is not None}, actor)
        commit_or_conflict(db)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": "CEG_CONFLICT", "message": "CEG already exists."}) from exc
    db.refresh(project)
    log_operation("project_create", actor.id, project_id=project.id, ceg=project.ceg, request_id=request.state.request_id)
    return project_read(project)


@app.put("/api/projects/{project_id}", response_model=ProjectRead)
def update_project(project_id: int, payload: ProjectUpdate, request: Request, db: Session = Depends(get_db), actor: Actor = Depends(get_actor)):
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Project not found."})
    if project.version != payload.version:
        raise HTTPException(409, detail={"code": "VERSION_CONFLICT", "message": "This project was changed by another user. Refresh and try again.", "current_version": project.version})
    changes = {}
    values = payload.model_dump(exclude={"version"})
    validate_reference_values(db, values, project)
    for key, value in values.items():
        before = getattr(project, key)
        if before != value:
            changes[key] = {"before": json_value(before), "after": json_value(value)}
    if values.get("po_release_date") is not None and project.lifecycle != Lifecycle.completed.value:
        values["lifecycle"] = Lifecycle.completed.value
        values["completed_at"] = utcnow()
        changes["lifecycle"] = {"before": project.lifecycle, "after": Lifecycle.completed.value}
    if changes:
        result = db.execute(update(Project).where(Project.id == project_id, Project.version == payload.version).values(
            **values, version=payload.version + 1, updated_by=actor.id, updated_at=utcnow(),
        ))
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(409, detail={"code": "VERSION_CONFLICT", "message": "This project was changed by another user. Refresh and try again."})
        add_audit(db, project, "updated", changes, actor)
        commit_or_conflict(db)
        db.expire_all()
        project = db.get(Project, project_id)
        log_operation("project_update", actor.id, project_id=project.id, ceg=project.ceg, request_id=request.state.request_id)
    return project_read(project)


def change_lifecycle(project_id: int, target: Lifecycle, action: str, payload: LifecycleRequest, db: Session, actor: Actor, request_id: str):
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Project not found."})
    if project.version != payload.version:
        raise HTTPException(409, detail={"code": "VERSION_CONFLICT", "message": "This project was changed by another user."})
    allowed = {"completed": {Lifecycle.active.value}, "reopened": {Lifecycle.completed.value}}
    if project.lifecycle not in allowed[action]:
        raise HTTPException(409, detail={"code": "INVALID_TRANSITION", "message": f"Cannot mark a {project.lifecycle} project as {target.value}."})
    before = project.lifecycle
    completed_at = utcnow() if target == Lifecycle.completed else (None if target == Lifecycle.active else project.completed_at)
    result = db.execute(update(Project).where(Project.id == project_id, Project.version == payload.version).values(
        lifecycle=target.value, completed_at=completed_at, archived_at=None,
        version=payload.version + 1, updated_by=actor.id, updated_at=utcnow(),
    ))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, detail={"code": "VERSION_CONFLICT", "message": "This project was changed by another user."})
    add_audit(db, project, action, {"lifecycle": {"before": before, "after": target.value}}, actor)
    db.commit()
    db.expire_all()
    project = db.get(Project, project_id)
    log_operation(f"project_{action}", actor.id, project_id=project.id, ceg=project.ceg, request_id=request_id)
    return project_read(project)


@app.post("/api/projects/{project_id}/complete", response_model=ProjectRead)
def complete_project(project_id: int, payload: LifecycleRequest, request: Request, db: Session = Depends(get_db), actor: Actor = Depends(get_actor)):
    return change_lifecycle(project_id, Lifecycle.completed, "completed", payload, db, actor, request.state.request_id)


@app.post("/api/projects/{project_id}/reopen", response_model=ProjectRead)
def reopen_project(project_id: int, payload: LifecycleRequest, request: Request, db: Session = Depends(get_db), actor: Actor = Depends(get_actor)):
    return change_lifecycle(project_id, Lifecycle.active, "reopened", payload, db, actor, request.state.request_id)


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: int, request: Request, version: int = Query(ge=1), db: Session = Depends(get_db), actor: Actor = Depends(get_actor)):
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Project not found."})
    if project.version != version:
        raise HTTPException(409, detail={"code": "VERSION_CONFLICT", "message": "This project changed before it could be deleted. Refresh and try again."})
    now = utcnow()
    project.deleted_at = now
    project.deleted_by = actor.id
    project.version += 1
    project.updated_by = actor.id
    project.updated_at = now
    add_audit(db, project, "trashed", {"deleted_at": {"before": None, "after": json_value(now)}}, actor)
    db.commit()
    log_operation("project_trash", actor.id, project_id=project.id, ceg=project.ceg, request_id=request.state.request_id)
    return Response(status_code=204)


@app.post("/api/projects/bulk-delete")
def bulk_delete_projects(payload: BulkProjectDeleteRequest, request: Request, db: Session = Depends(get_db), actor: Actor = Depends(get_actor)):
    requested = {item.id: item.version for item in payload.projects}
    projects = list(db.scalars(select(Project).where(Project.id.in_(requested))))
    found = {project.id: project for project in projects}
    missing = sorted(set(requested) - set(found))
    conflicts = sorted(project_id for project_id, project in found.items() if project.version != requested[project_id] or project.deleted_at is not None)
    if missing or conflicts:
        raise HTTPException(409, detail={"code": "BULK_DELETE_CONFLICT", "message": "Some selected projects changed or no longer exist. Refresh and try again.", "missing_ids": missing, "conflict_ids": conflicts})
    now = utcnow()
    for project in projects:
        project.deleted_at = now
        project.deleted_by = actor.id
        project.version += 1
        project.updated_by = actor.id
        project.updated_at = now
        add_audit(db, project, "trashed", {"deleted_at": {"before": None, "after": json_value(now)}}, actor)
    db.commit()
    log_operation("project_bulk_trash", actor.id, count=len(projects), request_id=request.state.request_id)
    return {"deleted": len(projects)}


@app.get("/api/recycle-bin", response_model=PaginatedProjects)
def list_recycle_bin(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db), _actor: Actor = Depends(get_actor)):
    filters = [Project.deleted_at.is_not(None)]
    total = db.scalar(select(func.count()).select_from(Project).where(*filters)) or 0
    items = db.scalars(select(Project).where(*filters).order_by(Project.deleted_at.desc(), Project.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return PaginatedProjects(items=[project_read(item) for item in items], total=total, page=page, page_size=page_size, pages=max(1, math.ceil(total / page_size)))


@app.post("/api/recycle-bin/restore")
def restore_projects(payload: BulkProjectDeleteRequest, request: Request, db: Session = Depends(get_db), actor: Actor = Depends(get_actor)):
    requested = {item.id: item.version for item in payload.projects}
    projects = list(db.scalars(select(Project).where(Project.id.in_(requested))))
    found = {project.id: project for project in projects}
    missing = sorted(set(requested) - set(found))
    conflicts = sorted(project_id for project_id, project in found.items() if project.version != requested[project_id] or project.deleted_at is None)
    if missing or conflicts:
        raise HTTPException(409, detail={"code": "RESTORE_CONFLICT", "message": "Some selected projects changed or are no longer in the recycle bin. Refresh and try again.", "missing_ids": missing, "conflict_ids": conflicts})
    now = utcnow()
    for project in projects:
        before = project.deleted_at
        project.deleted_at = None
        project.deleted_by = None
        project.version += 1
        project.updated_by = actor.id
        project.updated_at = now
        add_audit(db, project, "restored", {"deleted_at": {"before": json_value(before), "after": None}}, actor)
    db.commit()
    log_operation("project_restore", actor.id, count=len(projects), request_id=request.state.request_id)
    return {"restored": len(projects)}


@app.post("/api/recycle-bin/permanent-delete")
def permanently_delete_projects(payload: BulkProjectDeleteRequest, request: Request, db: Session = Depends(get_db), actor: Actor = Depends(get_actor)):
    requested = {item.id: item.version for item in payload.projects}
    projects = list(db.scalars(select(Project).where(Project.id.in_(requested))))
    found = {project.id: project for project in projects}
    missing = sorted(set(requested) - set(found))
    conflicts = sorted(project_id for project_id, project in found.items() if project.version != requested[project_id] or project.deleted_at is None)
    if missing or conflicts:
        raise HTTPException(409, detail={"code": "PERMANENT_DELETE_CONFLICT", "message": "Some selected projects changed or are no longer in the recycle bin. Refresh and try again.", "missing_ids": missing, "conflict_ids": conflicts})
    for project in projects:
        db.delete(project)
    db.commit()
    log_operation("project_permanent_delete", actor.id, count=len(projects), request_id=request.state.request_id)
    return {"deleted": len(projects)}


@app.get("/api/projects/{project_id}/audit-logs", response_model=list[AuditLogRead])
def audit_logs(project_id: int, db: Session = Depends(get_db), _actor: Actor = Depends(get_actor)):
    if not db.get(Project, project_id):
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Project not found."})
    logs = db.scalars(select(ProjectAuditLog).where(ProjectAuditLog.project_id == project_id).order_by(ProjectAuditLog.created_at.desc())).all()
    return [AuditLogRead(id=log.id, project_id=log.project_id, action=log.action, changes=json.loads(log.changes_json), actor_id=log.actor_id, actor_name=log.actor_name, created_at=log.created_at) for log in logs]


@app.get("/api/reference-options", response_model=list[ReferenceOptionRead])
def list_options(category: str | None = None, include_inactive: bool = False, db: Session = Depends(get_db), _actor: Actor = Depends(get_actor)):
    statement = select(ReferenceOption)
    if category:
        statement = statement.where(ReferenceOption.category == category)
    if not include_inactive:
        statement = statement.where(ReferenceOption.active.is_(True))
    return db.scalars(statement.order_by(ReferenceOption.category, ReferenceOption.sort_order, ReferenceOption.label_en)).all()


@app.post("/api/reference-options", response_model=ReferenceOptionRead, status_code=201)
def create_option(payload: ReferenceOptionCreate, db: Session = Depends(get_db), _actor: Actor = Depends(get_actor)):
    option = ReferenceOption(**payload.model_dump())
    db.add(option)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, detail={"code": "OPTION_CONFLICT", "message": "Option code already exists."}) from exc
    db.refresh(option)
    return option


@app.put("/api/reference-options/{option_id}", response_model=ReferenceOptionRead)
def update_option(option_id: int, payload: ReferenceOptionUpdate, db: Session = Depends(get_db), _actor: Actor = Depends(get_actor)):
    option = db.get(ReferenceOption, option_id)
    if not option:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Option not found."})
    for key, value in payload.model_dump().items():
        setattr(option, key, value)
    db.commit()
    db.refresh(option)
    return option


@app.delete("/api/reference-options/{option_id}", status_code=204)
def delete_option(option_id: int, db: Session = Depends(get_db), _actor: Actor = Depends(get_actor)):
    option = db.get(ReferenceOption, option_id)
    if not option:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Option not found."})
    project_field = {
        "supplier_type": Project.supplier_type,
        "procurement_strategy": Project.procurement_strategy,
        "procurement_status": Project.procurement_status,
    }[option.category]
    usage_count = db.scalar(select(func.count()).select_from(Project).where(project_field == option.code)) or 0
    if usage_count:
        raise HTTPException(409, detail={
            "code": "OPTION_IN_USE",
            "message": f"This option is used by {usage_count} project(s). Deactivate it instead of deleting it.",
            "usage_count": usage_count,
        })
    db.delete(option)
    db.commit()
    return Response(status_code=204)


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db), _actor: Actor = Depends(get_actor)):
    active_filter = Project.deleted_at.is_(None)
    lifecycle_counts = dict(db.execute(select(Project.lifecycle, func.count()).where(active_filter).group_by(Project.lifecycle)).all())
    priority_counts = dict(db.execute(select(Project.project_priority, func.count()).where(active_filter, Project.project_priority.is_not(None)).group_by(Project.project_priority)).all())
    status_counts = dict(db.execute(select(Project.procurement_status, func.count()).where(active_filter, Project.procurement_status.is_not(None)).group_by(Project.procurement_status)).all())
    overdue = db.scalar(select(func.count()).select_from(Project).where(active_filter, Project.lifecycle == "active", Project.estimated_closing_date < date.today())) or 0
    total_budget = db.scalar(select(func.coalesce(func.sum(Project.usd_amount), 0)).where(
        active_filter, Project.lifecycle == Lifecycle.active.value,
    )) or 0
    ceg_name = func.coalesce(func.nullif(Project.ceg, ""), "Unassigned")
    ceg_amount = func.coalesce(func.sum(Project.usd_amount), 0)
    ceg_overview_rows = db.execute(
        select(ceg_name, func.count(), ceg_amount)
        .where(active_filter)
        .group_by(ceg_name)
        .order_by(ceg_amount.desc(), func.count().desc())
    ).all()
    ceg_overview = [{"ceg": ceg, "project_count": count, "usd_amount": str(amount)} for ceg, count, amount in ceg_overview_rows]
    return {"lifecycle": lifecycle_counts, "overdue": overdue, "total_budget": str(total_budget), "priority": priority_counts, "procurement_status": status_counts, "ceg_overview": ceg_overview}


def parse_month(value: str | None, end: bool = False) -> date | None:
    if value is None or value == "":
        return None
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value):
        raise HTTPException(422, detail={"code": "INVALID_MONTH", "message": "Month must use YYYY-MM format."})
    year, month = map(int, value.split("-"))
    if end:
        next_month = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
        return next_month - timedelta(days=1)
    return date(year, month, 1)


@app.get("/api/ceg-analysis")
def ceg_analysis(
    from_month: str | None = None, to_month: str | None = None,
    ceg: str | None = None, lifecycle: str | None = None,
    priority: str | None = None, bu: str | None = None,
    db: Session = Depends(get_db), _actor: Actor = Depends(get_actor),
):
    start = parse_month(from_month)
    end = parse_month(to_month, end=True)
    if start and end and start > end:
        raise HTTPException(422, detail={"code": "INVALID_MONTH_RANGE", "message": "From Month cannot be later than To Month."})
    if lifecycle and lifecycle not in {Lifecycle.active.value, Lifecycle.completed.value}:
        raise HTTPException(422, detail={"code": "INVALID_LIFECYCLE", "message": "Lifecycle must be active or completed."})
    if priority and priority not in {"High", "Medium", "Normal"}:
        raise HTTPException(422, detail={"code": "INVALID_PRIORITY", "message": "Priority must be High, Medium, or Normal."})

    filters = [Project.deleted_at.is_(None)]
    if start:
        filters.append(Project.pr_approved_date >= start)
    if end:
        filters.append(Project.pr_approved_date <= end)
    if ceg:
        filters.append(Project.ceg == ceg)
    if lifecycle:
        filters.append(Project.lifecycle == lifecycle)
    if priority:
        filters.append(Project.project_priority == priority)
    if bu:
        filters.append(Project.bu == bu)

    today = date.today()
    rows = db.execute(select(
        Project.ceg,
        func.count(),
        func.coalesce(func.sum(Project.usd_amount), 0),
        func.sum(case((Project.project_priority == "High", 1), else_=0)),
        func.sum(case((Project.project_priority == "Medium", 1), else_=0)),
        func.sum(case((Project.project_priority == "Normal", 1), else_=0)),
        func.sum(case((Project.lifecycle == Lifecycle.completed.value, 1), else_=0)),
        func.sum(case((
            (Project.lifecycle == Lifecycle.active.value)
            & Project.estimated_closing_date.is_not(None)
            & (Project.estimated_closing_date < today), 1), else_=0)),
    ).where(*filters).group_by(Project.ceg).order_by(func.coalesce(func.sum(Project.usd_amount), 0).desc(), func.count().desc())).all()

    items = [{
        "ceg": row[0] or "Unassigned", "project_count": row[1], "usd_amount": str(row[2]),
        "high_priority_count": row[3] or 0, "medium_priority_count": row[4] or 0,
        "normal_priority_count": row[5] or 0, "completed_count": row[6] or 0,
        "overdue_count": row[7] or 0,
    } for row in rows]
    option_filters = [Project.deleted_at.is_(None)]
    ceg_options = list(db.scalars(select(Project.ceg).where(*option_filters, Project.ceg.is_not(None), Project.ceg != "").distinct().order_by(Project.ceg)))
    bu_options = list(db.scalars(select(Project.bu).where(*option_filters, Project.bu.is_not(None), Project.bu != "").distinct().order_by(Project.bu)))
    return {
        "items": items,
        "totals": {
            "project_count": sum(item["project_count"] for item in items),
            "usd_amount": str(sum((Decimal(item["usd_amount"]) for item in items), Decimal("0"))),
            "high_priority_count": sum(item["high_priority_count"] for item in items),
        },
        "options": {"ceg": ceg_options, "bu": bu_options},
    }


@app.get("/api/budget-analysis")
def budget_analysis(from_month: str | None = None, to_month: str | None = None, db: Session = Depends(get_db), _actor: Actor = Depends(get_actor)):
    start = parse_month(from_month)
    end = parse_month(to_month, end=True)
    if start and end and start > end:
        raise HTTPException(422, detail={"code": "INVALID_MONTH_RANGE", "message": "From Month cannot be later than To Month."})
    filters = [Project.deleted_at.is_(None), Project.lifecycle == Lifecycle.active.value, Project.pr_approved_date.is_not(None)]
    if start:
        filters.append(Project.pr_approved_date >= start)
    if end:
        filters.append(Project.pr_approved_date <= end)
    month_key = func.strftime("%Y-%m", Project.pr_approved_date)
    rows = db.execute(select(month_key, func.coalesce(func.sum(Project.usd_amount), 0), func.count()).where(*filters).group_by(month_key).order_by(month_key)).all()
    values = {month: (amount, count) for month, amount, count in rows}
    month_names = list(values)
    if start and end:
        month_names = []
        cursor = start
        while cursor <= end:
            month_names.append(cursor.strftime("%Y-%m"))
            cursor = date(cursor.year + (cursor.month == 12), 1 if cursor.month == 12 else cursor.month + 1, 1)
    monthly = [{"month": month, "usd_amount": str(values.get(month, (Decimal("0"), 0))[0]), "project_count": values.get(month, (Decimal("0"), 0))[1]} for month in month_names]
    return {"from_month": from_month, "to_month": to_month, "monthly": monthly, "total_usd_amount": str(sum((Decimal(item["usd_amount"]) for item in monthly), Decimal("0"))), "project_count": sum(item["project_count"] for item in monthly)}


def business_days_between(start: date, end: date) -> int:
    """Count Monday-Friday dates in [start, end)."""
    current = start
    total = 0
    while current < end:
        if current.weekday() < 5:
            total += 1
        current += timedelta(days=1)
    return total


EXPORT_COLUMNS = [
    ("Priority", "project_priority"), ("CEG", "ceg"), ("BU", "bu"), ("BU Requestor", "requestor"),
    ("Request Date", "request_date"), ("Budget (excl.tax)", "budget"), ("Currency", "currency"),
    ("Exchange Rate", "exchange_rate"), ("USD Amount", "usd_amount"), ("Description", "description"),
    ("Supplier Name", "supplier_name"), ("Supplier Type", "supplier_type"),
    ("Procurement Strategy", "procurement_strategy"), ("Procurement Status", "procurement_status"),
    ("Procurement Status Notes", "procurement_status_notes"),
    ("PR Approved Date", "pr_approved_date"), ("Estimated Project Closing Date", "estimated_closing_date"),
    ("EC Form", "ec_form"), ("Contract Required", "contract_required"), ("PO Release Date", "po_release_date"),
    ("Lifecycle", "lifecycle"), ("Overdue", "is_overdue"),
]
EXPORT_LABELS_ZH = {
    "Priority": "优先级", "CEG": "CEG", "BU": "业务部门", "BU Requestor": "BU 申请人",
    "Request Date": "申请日期", "Budget (excl.tax)": "预算（不含税）", "Currency": "币种",
    "Exchange Rate": "汇率", "USD Amount": "美元金额", "Description": "项目描述",
    "Supplier Name": "供应商名称", "Supplier Type": "供应商类型", "Procurement Strategy": "采购策略",
    "Procurement Status": "采购状态", "Procurement Status Notes": "采购状态备注", "PR Approved Date": "PR 批准日期",
    "Estimated Project Closing Date": "预计项目结束日期", "EC Form": "EC Form",
    "Contract Required": "是否需要签合同", "PO Release Date": "PO 发布日期",
    "Lifecycle": "生命周期", "Overdue": "是否逾期",
}


@app.get("/api/projects-export.xlsx")
def export_projects(
    request: Request,
    lifecycle: str | None = None, priority: str | None = None, ceg: str | None = None,
    keyword: str | None = None, procurement_status: str | None = None,
    bu: str | None = None, requestor: str | None = None,
    pr_approved_from: date | None = None, pr_approved_to: date | None = None,
    closing_from: date | None = None, closing_to: date | None = None, overdue: bool | None = None,
    language: str = "en",
    db: Session = Depends(get_db), actor: Actor = Depends(get_actor),
):
    started = time.perf_counter()
    filters = query_projects(lifecycle, priority, ceg, keyword, procurement_status, bu, requestor, pr_approved_from, pr_approved_to, closing_from, closing_to, overdue)
    projects = db.scalars(select(Project).where(*filters).order_by(PRIORITY_ORDER.asc(), Project.updated_at.desc(), Project.id.desc())).all()
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Projects"
    sheet.append([EXPORT_LABELS_ZH.get(label, label) if language == "zh" else label for label, _ in EXPORT_COLUMNS])
    for project in projects:
        data = project_read(project).model_dump()
        data["is_overdue"] = "Overdue" if data["is_overdue"] else "Not Overdue"
        sheet.append([data.get(field) for _, field in EXPORT_COLUMNS])
    budget_column = next(index for index, (_, field) in enumerate(EXPORT_COLUMNS, start=1) if field == "budget")
    usd_column = next(index for index, (_, field) in enumerate(EXPORT_COLUMNS, start=1) if field == "usd_amount")
    for row in range(2, sheet.max_row + 1):
        sheet.cell(row=row, column=budget_column).number_format = "#,##0.00"
        sheet.cell(row=row, column=usd_column).number_format = "#,##0.00"
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    analysis = workbook.create_sheet("Monthly Analysis")
    analysis.append(["Month", "Project Count", "Monthly Amount", "MoM Change"])
    monthly_values: dict[str, dict[str, Decimal | int]] = {}
    for project in projects:
        if not project.pr_approved_date:
            continue
        month = project.pr_approved_date.strftime("%Y-%m")
        entry = monthly_values.setdefault(month, {"count": 0, "amount": Decimal("0")})
        entry["count"] = int(entry["count"]) + 1
        entry["amount"] = Decimal(entry["amount"]) + (project.usd_amount or Decimal("0"))
    month_names = sorted(monthly_values)
    if pr_approved_from and pr_approved_to:
        month_names = []
        cursor = pr_approved_from.replace(day=1)
        final_month = pr_approved_to.replace(day=1)
        while cursor <= final_month:
            month_names.append(cursor.strftime("%Y-%m"))
            cursor = date(cursor.year + (cursor.month == 12), 1 if cursor.month == 12 else cursor.month + 1, 1)
    for month in month_names:
        entry = monthly_values.get(month, {"count": 0, "amount": Decimal("0")})
        analysis.append([month, entry["count"], entry["amount"]])
    for cell in analysis[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2C2C2E")
    monthly_last_row = analysis.max_row
    for row in range(2, monthly_last_row + 1):
        analysis.cell(row=row, column=3).number_format = '"USD "#,##0.00'
        if row == 2:
            analysis.cell(row=row, column=4, value="")
        else:
            analysis.cell(row=row, column=4, value=f'=IF(C{row-1}=0,IF(C{row}=0,0,1),C{row}/C{row-1}-1)')
            analysis.cell(row=row, column=4).number_format = "0.0%"
    analysis.column_dimensions["A"].width = 14
    analysis.column_dimensions["B"].width = 16
    analysis.column_dimensions["C"].width = 20
    analysis.column_dimensions["D"].width = 16
    analysis.freeze_panes = "A2"
    if monthly_last_row >= 2:
        categories = Reference(analysis, min_col=1, min_row=2, max_row=monthly_last_row)
        amounts = Reference(analysis, min_col=3, min_row=1, max_row=monthly_last_row)
        bars = BarChart()
        bars.type = "col"
        bars.add_data(amounts, titles_from_data=True)
        bars.set_categories(categories)
        month_category_ref = f"'Monthly Analysis'!$A$2:$A${monthly_last_row}"
        bars.series[0].cat = AxDataSource(strRef=StrRef(
            f=month_category_ref,
            strCache=StrData(ptCount=len(month_names), pt=[StrVal(idx=index, v=month) for index, month in enumerate(month_names)]),
        ))
        bars.title = "Monthly Amount"
        bars.y_axis.title = "Amount (USD)"
        bars.y_axis.numFmt = '"USD "#,##0.00'
        bars.y_axis.scaling.min = 0
        bars.x_axis.title = "Year-Month (YYYY-MM)"
        bars.x_axis.tickLblSkip = 1
        bars.x_axis.tickMarkSkip = 1
        bars.x_axis.tickLblPos = "low"
        bars.x_axis.noMultiLvlLbl = True
        bars.y_axis.tickLblPos = "nextTo"
        bars.x_axis.spPr = GraphicalProperties(ln=LineProperties(solidFill="595959", w=12700))
        bars.y_axis.spPr = GraphicalProperties(ln=LineProperties(solidFill="595959", w=12700))
        bars.y_axis.majorGridlines = ChartLines(spPr=GraphicalProperties(ln=LineProperties(solidFill="D9E2F3", w=6350)))
        bars.legend = None
        bars.height = 11.5
        bars.width = 28
        bars.gapWidth = 65
        bars.series[0].graphicalProperties.solidFill = "5B9BD5"
        bars.series[0].graphicalProperties.line.solidFill = "4472C4"
        bars.dLbls = DataLabelList()
        bars.dLbls.showVal = True
        bars.dLbls.numFmt = '"USD "#,##0.00'
        bars.dLbls.dLblPos = "inEnd"
        analysis.add_chart(bars, "F2")
        line = LineChart()
        monthly_change = Reference(analysis, min_col=4, min_row=1, max_row=monthly_last_row)
        line.add_data(monthly_change, titles_from_data=True)
        line.set_categories(categories)
        line.series[0].cat = AxDataSource(strRef=StrRef(
            f=month_category_ref,
            strCache=StrData(ptCount=len(month_names), pt=[StrVal(idx=index, v=month) for index, month in enumerate(month_names)]),
        ))
        line.y_axis.title = "Change (%)"
        line.y_axis.numFmt = "0%"
        line.y_axis.tickLblPos = "nextTo"
        line.x_axis.tickLblPos = "low"
        line.x_axis.spPr = GraphicalProperties(ln=LineProperties(solidFill="595959", w=12700))
        line.y_axis.spPr = GraphicalProperties(ln=LineProperties(solidFill="595959", w=12700))
        line.y_axis.majorGridlines = ChartLines(spPr=GraphicalProperties(ln=LineProperties(solidFill="FCE4D6", w=6350)))
        line.title = "Monthly Change"
        line.x_axis.title = "Year-Month (YYYY-MM)"
        line.legend = None
        line.x_axis.tickLblSkip = 1
        line.x_axis.tickMarkSkip = 1
        line.x_axis.noMultiLvlLbl = True
        line.height = 11.5
        line.width = 28
        line.series[0].graphicalProperties.line.solidFill = "ED7D31"
        line.series[0].graphicalProperties.line.width = 19050
        line.series[0].marker.symbol = "circle"
        line.series[0].marker.size = 7
        line.series[0].marker.graphicalProperties.solidFill = "ED7D31"
        line.series[0].marker.graphicalProperties.line.solidFill = "C65911"
        line.dLbls = DataLabelList()
        line.dLbls.showVal = True
        line.dLbls.numFmt = "0.0%"
        line.dLbls.dLblPos = "t"
        analysis.add_chart(line, "F28")
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    log_operation("project_export", actor.id, count=len(projects), duration_ms=(time.perf_counter() - started) * 1000,
                  request_id=request.state.request_id, message="Project Excel export generated.")
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=procurement-projects.xlsx"})
