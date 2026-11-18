"""add actual price and exchange-rate snapshot

Revision ID: 0010_add_actual_price
Revises: 0009_add_access_grants
"""
from alembic import op
import sqlalchemy as sa


revision = "0010_add_actual_price"
down_revision = "0009_add_access_grants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.add_column(sa.Column("actual_price", sa.Numeric(18, 2), nullable=True))
        batch_op.add_column(sa.Column("actual_currency", sa.String(length=3), nullable=True))
        batch_op.add_column(sa.Column("actual_exchange_rate", sa.Numeric(38, 20), nullable=True))
        batch_op.add_column(sa.Column("actual_usd_amount", sa.Numeric(18, 2), nullable=True))
        batch_op.add_column(sa.Column("actual_exchange_rate_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_column("actual_exchange_rate_at")
        batch_op.drop_column("actual_usd_amount")
        batch_op.drop_column("actual_exchange_rate")
        batch_op.drop_column("actual_currency")
        batch_op.drop_column("actual_price")
