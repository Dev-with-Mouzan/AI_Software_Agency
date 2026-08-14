"""add project ownership columns for authenticated users

Adds `projects.owner_id` (and the auth-related `users` columns) so databases
created before the auth feature can be upgraded in place. Every ALTER is
guarded — the migration must be safe both on fresh databases and on existing
ones where `create_all` already produced the schema.

Revision ID: c7f2e9d1a3b4
Revises: a5e9c3d7b1f0
Create Date: 2026-08-14 00:00:00.000000
"""

import sqlalchemy as sa
from sqlalchemy import inspect

import agency.db.base
from alembic import op

revision = "c7f2e9d1a3b4"
down_revision = "a5e9c3d7b1f0"
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    return name in inspect(bind).get_table_names()


def _has_column(bind, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    # `users` may not exist yet when alembic runs ahead of the app's create_all,
    # so no FK is declared here — the ORM relationship handles cascades.
    if _has_table(bind, "projects") and not _has_column(bind, "projects", "owner_id"):
        op.add_column(
            "projects",
            sa.Column("owner_id", agency.db.base.GUID(length=36), nullable=True),
        )
        op.create_index("ix_projects_owner_id", "projects", ["owner_id"], unique=False)

    if _has_table(bind, "users"):
        if not _has_column(bind, "users", "google_id"):
            op.add_column(
                "users",
                sa.Column("google_id", sa.String(length=255), nullable=True),
            )
        if not _has_column(bind, "users", "last_login_at"):
            op.add_column(
                "users",
                sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
            )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "users"):
        if _has_column(bind, "users", "last_login_at"):
            op.drop_column("users", "last_login_at")
        if _has_column(bind, "users", "google_id"):
            op.drop_column("users", "google_id")
    if _has_table(bind, "projects") and _has_column(bind, "projects", "owner_id"):
        op.drop_index("ix_projects_owner_id", table_name="projects")
        op.drop_column("projects", "owner_id")
