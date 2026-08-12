"""Audit logging for every agent and human action."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from agency.core.enums import AuditAction
from agency.db.models import AuditLog

logger = logging.getLogger(__name__)


async def record(
    session: AsyncSession,
    *,
    actor: str,
    action: str | AuditAction,
    resource_type: str = "",
    resource_id: str = "",
    allowed: bool = True,
    detail: dict[str, Any] | None = None,
) -> None:
    """Persist an audit entry. Never raises — audit failures must not block work."""
    try:
        entry = AuditLog(
            actor=actor,
            action=action.value if isinstance(action, AuditAction) else str(action),
            resource_type=resource_type,
            resource_id=resource_id,
            allowed=allowed,
            detail=detail or {},
            created_at=datetime.now(UTC),
        )
        session.add(entry)
        # Write inside a savepoint so a failing audit insert rolls back only
        # itself and never the caller's in-flight transaction.
        async with session.begin_nested():
            await session.flush()
    except Exception:  # pragma: no cover
        logger.exception("failed to write audit log entry")
