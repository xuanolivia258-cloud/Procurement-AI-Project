"""add access grants

Revision ID: 0009_add_access_grants
Revises: 0008_add_project_recycle_bin
"""
from alembic import op
import sqlalchemy as sa


revision = "0009_add_access_grants"
down_revision = "0008_add_project_recycle_bin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "access_grants",
        sa.Column("employee_id", sa.String(length=200), primary_key=True),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("cn_name", sa.String(length=200), nullable=True),
        sa.Column("full_name", sa.String(length=200), nullable=True),
        sa.Column("department", sa.String(length=300), nullable=True),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column("updated_by", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("access_grants")
