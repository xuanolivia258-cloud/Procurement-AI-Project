"""add project currency

Revision ID: 0004_add_project_currency
Revises: 0003_add_contract_required
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_add_project_currency"
down_revision = "0003_add_contract_required"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("currency", sa.String(length=3), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "currency")
