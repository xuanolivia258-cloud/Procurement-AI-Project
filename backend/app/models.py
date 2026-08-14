from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Lifecycle(str, Enum):
    active = "active"
    completed = "completed"


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        Index("ix_projects_lifecycle", "lifecycle"),
        Index("ix_projects_closing_date", "estimated_closing_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_priority: Mapped[str | None] = mapped_column(String(20))
    ceg: Mapped[str | None] = mapped_column(String(120))
    requestor: Mapped[str | None] = mapped_column(String(200))
    bu: Mapped[str | None] = mapped_column(String(200))
    request_date: Mapped[date | None] = mapped_column(Date)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    exchange_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    usd_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    exchange_rate_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    description: Mapped[str | None] = mapped_column(Text)
    supplier_name: Mapped[str | None] = mapped_column(String(300))
    supplier_type: Mapped[str | None] = mapped_column(String(100))
    procurement_strategy: Mapped[str | None] = mapped_column(String(100))
    procurement_status: Mapped[str | None] = mapped_column(String(100))
    procurement_status_notes: Mapped[str | None] = mapped_column(Text)
    pr_approved_date: Mapped[date | None] = mapped_column(Date)
    estimated_closing_date: Mapped[date | None] = mapped_column(Date)
    ec_form: Mapped[str | None] = mapped_column(String(1))
    contract_required: Mapped[str | None] = mapped_column(String(3))
    po_release_date: Mapped[date | None] = mapped_column(Date)
    lifecycle: Mapped[str] = mapped_column(String(20), default=Lifecycle.active.value)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_by: Mapped[str] = mapped_column(String(200))
    updated_by: Mapped[str] = mapped_column(String(200))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    deleted_by: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    audit_logs: Mapped[list["ProjectAuditLog"]] = relationship(back_populates="project", cascade="all, delete-orphan")

class ProjectAuditLog(Base):
    __tablename__ = "project_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(30))
    changes_json: Mapped[str] = mapped_column(Text, default="{}")
    actor_id: Mapped[str] = mapped_column(String(200))
    actor_name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    project: Mapped[Project] = relationship(back_populates="audit_logs")


class ReferenceOption(Base):
    __tablename__ = "reference_options"
    __table_args__ = (UniqueConstraint("category", "code", name="uq_reference_category_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(60), index=True)
    code: Mapped[str] = mapped_column(String(100))
    label_en: Mapped[str] = mapped_column(String(200))
    label_zh: Mapped[str] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
