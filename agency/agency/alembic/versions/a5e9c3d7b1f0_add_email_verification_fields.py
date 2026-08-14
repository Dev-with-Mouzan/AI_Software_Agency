"""add email verification and profile avatar fields

Revision ID: a5e9c3d7b1f0
Revises: d4f8b2a1c3e5
Create Date: 2026-08-13 00:00:00.000000
"""

import sqlalchemy as sa

import agency.db.base
from alembic import op
from sqlalchemy import inspect

revision = "a5e9c3d7b1f0"
down_revision = "d4f8b2a1c3e5"
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    return name in inspect(bind).get_table_names()


def _has_column(bind, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    # `users` is created by SQLAlchemy create_all at app start (not alembic), so
    # guard every ALTER — the migration also runs against databases where the
    # columns already exist via the dev/sqlite patch path.
    if _has_table(bind, "users"):
        if not _has_column(bind, "users", "email_verified"):
            op.add_column(
                "users",
                sa.Column(
                    "email_verified", sa.Boolean(), nullable=False, server_default=sa.false()
                ),
            )
        if not _has_column(bind, "users", "avatar_url"):
            op.add_column(
                "users",
                sa.Column("avatar_url", sa.String(length=300), nullable=False, server_default=""),
            )

    if not _has_table(bind, "email_verification_codes"):
        op.create_table(
            "email_verification_codes",
            sa.Column("id", agency.db.base.GUID(length=36), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("code_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_email_verification_codes_email", "email_verification_codes", ["email"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "email_verification_codes"):
        op.drop_index("ix_email_verification_codes_email", table_name="email_verification_codes")
        op.drop_table("email_verification_codes")
    if _has_table(bind, "users"):
        if _has_column(bind, "users", "avatar_url"):
            op.drop_column("users", "avatar_url")
        if _has_column(bind, "users", "email_verified"):
            op.drop_column("users", "email_verified")
