"""add calculated saving amount

Revision ID: 0011_add_saving_amount
Revises: 0010_add_actual_price
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_add_saving_amount"
down_revision = "0010_add_actual_price"
branch_labels = None
depends_on = None

def upgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.add_column(sa.Column("saving_amount", sa.Numeric(18, 2), nullable=True))
        batch_op.add_column(sa.Column("saving_currency", sa.String(length=3), nullable=True))
        batch_op.add_column(sa.Column("saving_usd_amount", sa.Numeric(18, 2), nullable=True))

def downgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_column("saving_usd_amount")
        batch_op.drop_column("saving_currency")
        batch_op.drop_column("saving_amount")
