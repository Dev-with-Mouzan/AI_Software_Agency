"""LLM provider settings endpoints (Settings UI)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from agency.api.deps import CurrentUser, DbSession
from agency.schemas.settings import (
    ProviderConfigIn,
    SettingsIn,
    SettingsOut,
    TestProviderOut,
)
from agency.services import settings as settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/llm", response_model=SettingsOut)
async def get_llm_settings(session: DbSession, user: CurrentUser) -> SettingsOut:
    return await settings_service.get_settings_out(session)


@router.put("/llm", response_model=SettingsOut)
async def update_llm_settings(
    payload: SettingsIn, session: DbSession, user: CurrentUser
) -> SettingsOut:
    await settings_service.update_settings(session, payload)
    return await settings_service.get_settings_out(session)


@router.post("/llm/test", response_model=TestProviderOut)
async def test_provider(
    payload: ProviderConfigIn, user: CurrentUser
) -> TestProviderOut:
    """Validate the provider SDK + API key are usable without a live call."""
    from agency.llm import adapters

    key = payload.api_key
    if not key:
        key = settings_service.provider_key(payload.provider)
    if not key:
        raise HTTPException(400, f"No API key configured for {payload.provider}.")
    model = payload.model or settings_service.provider_model(payload.provider)
    base_url = payload.base_url or settings_service.provider_base_url(payload.provider)
    try:
        adapters.build_langchain_provider(
            provider=payload.provider, model=model, api_key=key, base_url=base_url
        )
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    return TestProviderOut(ok=True, detail=f"{payload.provider} / {model} is configured")
