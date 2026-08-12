"""Shared API dependencies: DB session + optional bearer-token auth."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from agency.config import get_settings
from agency.db.session import get_session

DbSession = Annotated[AsyncSession, Depends(get_session)]


async def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    """Enforce a shared bearer token when API_TOKEN is configured."""
    settings = get_settings()
    if not settings.api_token:
        return
    expected = f"Bearer {settings.api_token}"
    if not secrets.compare_digest(authorization or "", expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or missing token"
        )


Auth = Depends(require_token)
