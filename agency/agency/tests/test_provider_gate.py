"""AI-provider gate: no agent, chat, workflow or AI action may run without a
configured AI API key/provider. A missing key must fail loudly with the
machine-readable AI_PROVIDER_NOT_CONFIGURED error — never fake success.
"""

from __future__ import annotations

import pytest

from agency.services import settings as settings_service


class _FakeSettings:
    environment = "development"
    llm_provider = "null"


def _strip_env_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in (
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "DEEPSEEK_API_KEY",
        "QWEN_API_KEY",
    ):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "null")
    monkeypatch.setenv("AGENT_MODELS", "{}")


def _gate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings_service, "_runtime", settings_service.RuntimeSettings())
    from agency.config import get_settings

    get_settings.cache_clear()


def test_ensure_api_configured_raises_without_provider(monkeypatch) -> None:
    _strip_env_keys(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "development")
    _gate(monkeypatch)

    from agency.services.settings import AIProviderNotConfiguredError, ensure_api_configured

    with pytest.raises(AIProviderNotConfiguredError):
        ensure_api_configured()


def test_ensure_api_configured_allows_offline_only_in_test_env(monkeypatch) -> None:
    _strip_env_keys(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "test")
    _gate(monkeypatch)

    from agency.services.settings import ensure_api_configured

    ensure_api_configured()  # must not raise in the explicit test environment


async def test_api_agents_run_returns_503_when_no_provider(
    client, project, monkeypatch
) -> None:
    _gate(monkeypatch)
    monkeypatch.setattr(settings_service, "any_provider_configured", lambda: False)
    monkeypatch.setattr(settings_service, "get_settings", lambda: _FakeSettings())

    resp = await client.post(
        "/api/agents/run",
        json={
            "project_id": str(project.id),
            "agents": ["planner", "backend_engineer"],
            "command": "Build a REST API",
            "plan_source": "agent",
        },
    )
    assert resp.status_code == 503
    body = resp.json()
    assert body["code"] == "AI_PROVIDER_NOT_CONFIGURED"
    assert "AI provider not configured. Add your API key in Settings to run agents." in body["detail"]


async def test_api_chat_returns_503_when_no_provider(client, monkeypatch) -> None:
    _gate(monkeypatch)
    monkeypatch.setattr(settings_service, "any_provider_configured", lambda: False)
    monkeypatch.setattr(settings_service, "get_settings", lambda: _FakeSettings())

    resp = await client.post("/api/chat", json={"message": "Plan a new portal project"})
    assert resp.status_code == 503
    body = resp.json()
    assert body["code"] == "AI_PROVIDER_NOT_CONFIGURED"
    assert "AI provider not configured. Add your API key in Settings to run agents." in body["detail"]


async def test_api_agents_run_still_works_in_test_offline(client, project) -> None:
    resp = await client.post(
        "/api/agents/run",
        json={
            "project_id": str(project.id),
            "agents": ["planner"],
            "command": "Build a REST API",
            "plan_source": "agent",
        },
    )
    assert resp.status_code == 201, resp.text
