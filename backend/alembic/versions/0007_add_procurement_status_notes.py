"""add procurement status notes

Revision ID: 0007_add_procurement_status_notes
Revises: 0006_allow_duplicate_ceg
"""
from alembic import op
import sqlalchemy as sa


revision = "0007_add_procurement_status_notes"
down_revision = "0006_allow_duplicate_ceg"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("procurement_status_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "procurement_status_notes")
