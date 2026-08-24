from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


Priority = Literal["Normal", "Medium", "High"]
EcForm = Literal["Y", "N", "N/A"]
ContractRequired = Literal["Y", "N", "N/A"]
Currency = Literal["CAD", "USD", "CNY", "EUR"]


class Actor(BaseModel):
    id: str
    name: str
    role: Literal["admin", "editor", "viewer"] = "admin"


class ProjectFields(BaseModel):
    project_priority: Priority | None = None
    ceg: str | None = Field(default=None, max_length=120)
    requestor: str | None = Field(default=None, max_length=200)
    bu: str | None = Field(default=None, max_length=200)
    request_date: date | None = None
    budget: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=2)
    currency: Currency | None = None
    exchange_rate: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=8)
    usd_amount: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=2)
    exchange_rate_at: datetime | None = None
    description: str | None = None
    supplier_name: str | None = Field(default=None, max_length=300)
    supplier_type: str | None = Field(default=None, max_length=100)
    procurement_strategy: str | None = Field(default=None, max_length=100)
    procurement_status: str | None = Field(default=None, max_length=100)
    procurement_status_notes: str | None = None
    pr_approved_date: date | None = None
    estimated_closing_date: date | None = None
    ec_form: EcForm | None = None
    contract_required: ContractRequired | None = None
    po_release_date: date | None = None

    @field_validator("ceg", "requestor", "bu", "description", "supplier_name", "supplier_type", "procurement_strategy", "procurement_status", "procurement_status_notes", mode="before")
    @classmethod
    def blank_to_none(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("ceg", "requestor", "bu", "description", "supplier_name", "procurement_status_notes")
    @classmethod
    def capitalize_first_english_letter(cls, value):
        if value and value[0].isascii() and value[0].islower():
            return value[0].upper() + value[1:]
        return value

    @model_validator(mode="after")
    def calculate_usd_amount(self):
        if self.budget is not None and self.exchange_rate is not None:
            self.usd_amount = (self.budget * self.exchange_rate).quantize(Decimal("0.01"))
        elif self.budget is None or self.currency is None:
            self.usd_amount = None
        return self


class ProjectCreate(ProjectFields):
    pass


class ProjectUpdate(ProjectFields):
    version: int = Field(ge=1)


class ProjectRead(ProjectFields):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lifecycle: str
    version: int
    is_overdue: bool
    project_cycle_business_days: int | None
    created_by: str
    updated_by: str
    completed_at: datetime | None
    archived_at: datetime | None
    deleted_at: datetime | None
    deleted_by: str | None
    created_at: datetime
    updated_at: datetime


class PaginatedProjects(BaseModel):
    items: list[ProjectRead]
    total: int
    page: int
    page_size: int
    pages: int


class LifecycleRequest(BaseModel):
    version: int = Field(ge=1)


class BulkProjectDeleteItem(BaseModel):
    id: int = Field(ge=1)
    version: int = Field(ge=1)


class BulkProjectDeleteRequest(BaseModel):
    projects: list[BulkProjectDeleteItem] = Field(min_length=1)


class ReferenceOptionCreate(BaseModel):
    category: Literal["supplier_type", "procurement_strategy", "procurement_status"]
    code: str = Field(min_length=1, max_length=100)
    label_en: str = Field(min_length=1, max_length=200)
    label_zh: str = Field(min_length=1, max_length=200)
    sort_order: int = 0


class ReferenceOptionUpdate(BaseModel):
    label_en: str = Field(min_length=1, max_length=200)
    label_zh: str = Field(min_length=1, max_length=200)
    active: bool
    sort_order: int


class ReferenceOptionRead(ReferenceOptionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    active: bool


class AuditLogRead(BaseModel):
    id: int
    project_id: int
    action: str
    changes: dict
    actor_id: str
    actor_name: str
    created_at: datetime
