"""Notification endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from agency.api.deps import DbSession
from agency.db.models import Notification
from agency.schemas.agent import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    session: DbSession, unread_only: bool = False
) -> list[NotificationOut]:
    stmt = select(Notification).order_by(Notification.created_at.desc()).limit(100)
    if unread_only:
        stmt = stmt.where(Notification.read == False)  # noqa: E712
    rows = list((await session.scalars(stmt)).all())
    return [NotificationOut.model_validate(r) for r in rows]


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(notification_id: UUID, session: DbSession) -> NotificationOut:
    notification = await session.get(Notification, notification_id)
    if notification is None:
        raise HTTPException(404, "notification not found")
    notification.read = True
    await session.commit()
    return NotificationOut.model_validate(notification)


async def notify(
    session: DbSession, *, title: str, body: str = "", kind: str = "info", recipient: str = "human"
) -> Notification:
    notification = Notification(recipient=recipient, kind=kind, title=title, body=body)
    session.add(notification)
    await session.flush()
    return notification
