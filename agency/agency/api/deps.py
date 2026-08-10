"""Shared API dependencies: DB session + optional bearer-token auth."""

from __future__ import annotations

import secrets
from typing import Annotated

import httpx
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


async def get_public_api_url() -> str:
    settings = get_settings()
    return f"http://{settings.api_host}:{settings.api_port}/api"


class ApiClient:
    """Thin HTTP client for internal service-to-service calls."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or get_settings().api_host

    async def get(self, path: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=10) as client:
            resp = await client.get(path)
            resp.raise_for_status()
            return resp.json()
