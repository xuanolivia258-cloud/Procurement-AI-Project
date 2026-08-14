"""allow duplicate CEG values

Revision ID: 0006_allow_duplicate_ceg
Revises: 0005_add_exchange_rate_snapshot
"""
from alembic import op
import sqlalchemy as sa


revision = "0006_allow_duplicate_ceg"
down_revision = "0005_add_exchange_rate_snapshot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("uq_projects_ceg_ci", table_name="projects")


def downgrade() -> None:
    op.create_index(
        "uq_projects_ceg_ci",
        "projects",
        [sa.text("lower(ceg)")],
        unique=True,
        sqlite_where=sa.text("ceg IS NOT NULL AND trim(ceg) != ''"),
    )
