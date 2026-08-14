"""add exchange rate snapshot

Revision ID: 0005_add_exchange_rate_snapshot
Revises: 0004_add_project_currency
"""
from alembic import op
import sqlalchemy as sa


revision = "0005_add_exchange_rate_snapshot"
down_revision = "0004_add_project_currency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("exchange_rate", sa.Numeric(18, 8), nullable=True))
    op.add_column("projects", sa.Column("usd_amount", sa.Numeric(18, 2), nullable=True))
    op.add_column("projects", sa.Column("exchange_rate_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "exchange_rate_at")
    op.drop_column("projects", "usd_amount")
    op.drop_column("projects", "exchange_rate")
