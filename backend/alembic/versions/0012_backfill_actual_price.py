"""backfill legacy amount values into actual price

Revision ID: 0012_backfill_actual_price
Revises: 0011_add_saving_amount
"""
from alembic import op


revision = "0012_backfill_actual_price"
down_revision = "0011_add_saving_amount"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Preserve explicitly entered Actual Price values. Only legacy rows that
    # predate the Actual Price fields are backfilled from their original amount.
    op.execute("""
        UPDATE projects
        SET actual_price = budget,
            actual_currency = currency,
            actual_exchange_rate = exchange_rate,
            actual_usd_amount = usd_amount,
            actual_exchange_rate_at = exchange_rate_at,
            saving_amount = 0.00,
            saving_currency = currency,
            saving_usd_amount = 0.00
        WHERE actual_price IS NULL
          AND budget IS NOT NULL
    """)


def downgrade() -> None:
    # This is a data-preserving migration. Reversing it would destroy the
    # distinction between backfilled and subsequently edited values.
    pass
