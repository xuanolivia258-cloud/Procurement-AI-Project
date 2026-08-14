"""Restore archived projects and remove the archived lifecycle from the product."""
from alembic import op

revision = "0002_remove_archived_lifecycle"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE projects SET lifecycle = 'active', archived_at = NULL WHERE lifecycle = 'archived'")


def downgrade():
    pass
