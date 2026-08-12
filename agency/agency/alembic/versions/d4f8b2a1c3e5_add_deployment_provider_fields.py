"""add provider fields to deployments

Revision ID: d4f8b2a1c3e5
Revises: 9c3e1f2a4b6d
Create Date: 2026-08-12 00:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

revision = "d4f8b2a1c3e5"
down_revision = "9c3e1f2a4b6d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "deployments",
        sa.Column("provider", sa.String(length=40), nullable=False, server_default=""),
    )
    op.add_column(
        "deployments",
        sa.Column("deployment_url", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "deployments",
        sa.Column("project_url", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "deployments",
        sa.Column("deployment_id", sa.String(length=200), nullable=False, server_default=""),
    )
    op.add_column(
        "deployments",
        sa.Column("custom_domain", sa.String(length=300), nullable=False, server_default=""),
    )
    op.add_column(
        "deployments",
        sa.Column("domain_status", sa.String(length=30), nullable=False, server_default="none"),
    )
    op.add_column("deployments", sa.Column("dns_records", sa.JSON(), nullable=True))
    op.add_column(
        "deployments",
        sa.Column("deployed_commit", sa.String(length=100), nullable=False, server_default=""),
    )
    op.add_column(
        "deployments",
        sa.Column("run_id", sa.String(length=36), nullable=False, server_default=""),
    )
    op.add_column("deployments", sa.Column("logs", sa.JSON(), nullable=True))
    op.add_column(
        "deployments",
        sa.Column("removed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    for column in (
        "removed",
        "logs",
        "run_id",
        "deployed_commit",
        "dns_records",
        "domain_status",
        "custom_domain",
        "deployment_id",
        "project_url",
        "deployment_url",
        "provider",
    ):
        op.drop_column("deployments", column)
