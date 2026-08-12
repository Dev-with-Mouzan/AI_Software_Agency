"""Audit trail endpoints — the immutable log of every agent and human action."""

from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import select

from agency.api.deps import DbSession
from agency.db.models import AuditLog
from agency.schemas.agent import AuditLogOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogOut])
async def list_audit(
    session: DbSession,
    actor: str | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    limit: int = Query(default=200, ge=1, le=500),
) -> list[AuditLogOut]:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if actor:
        stmt = stmt.where(AuditLog.actor == actor)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    rows = list((await session.scalars(stmt)).all())
    return [AuditLogOut.model_validate(row) for row in rows]
