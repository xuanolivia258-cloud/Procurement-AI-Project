"""add project recycle bin

Revision ID: 0008_add_project_recycle_bin
Revises: 0007_add_procurement_status_notes
"""
from alembic import op
import sqlalchemy as sa


revision = "0008_add_project_recycle_bin"
down_revision = "0007_add_procurement_status_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("projects", sa.Column("deleted_by", sa.String(length=200), nullable=True))
    op.create_index("ix_projects_deleted_at", "projects", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_projects_deleted_at", table_name="projects")
    op.drop_column("projects", "deleted_by")
    op.drop_column("projects", "deleted_at")
