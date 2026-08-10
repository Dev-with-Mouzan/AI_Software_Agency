"""Health check endpoints."""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from agency import __version__
from agency.api.deps import DbSession
from agency.config import get_settings
from agency.schemas.common import HealthStatus

router = APIRouter(tags=["health"])

_started = time.time()


@router.get("/health", response_model=HealthStatus)
async def health(session: DbSession) -> HealthStatus:
    settings = get_settings()
    db_status = "ok"
    services: dict[str, str] = {"database": "ok"}
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        db_status = "unavailable"
        services["database"] = db_status

    # Redis is optional at runtime; report without failing the check.
    services["redis"] = "not_configured"
    return HealthStatus(
        status="ok" if db_status == "ok" else "degraded",
        version=__version__,
        environment=settings.environment,
        database=db_status,
        uptime_seconds=round(time.time() - _started, 2),
        services=services,
        timestamp=datetime.now(UTC),
    )


@router.get("/health/ready")
async def ready(session: DbSession) -> dict[str, Any]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        # Never leak connection details to callers.
        return {"ready": False, "detail": "database unavailable"}
    return {"ready": True}
