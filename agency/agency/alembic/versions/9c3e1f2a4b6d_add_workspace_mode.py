"""add workspace_mode to projects

Revision ID: 9c3e1f2a4b6d
Revises: bafd640b3bdd
Create Date: 2026-08-08 00:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

revision = "9c3e1f2a4b6d"
down_revision = "bafd640b3bdd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "workspace_mode", sa.String(length=20), nullable=False, server_default="structured"
        ),
    )


def downgrade() -> None:
    op.drop_column("projects", "workspace_mode")
