"""Add contract required project field."""
from alembic import op
import sqlalchemy as sa

revision = "0003_add_contract_required"
down_revision = "0002_remove_archived_lifecycle"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("contract_required", sa.String(length=3), nullable=True))


def downgrade():
    op.drop_column("projects", "contract_required")
