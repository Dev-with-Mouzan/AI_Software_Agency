"""Per-agent LLM routing tests (AGENT_MODELS env-driven config)."""

from __future__ import annotations

import json

import pytest

from agency.config import get_settings


def _configure(monkeypatch: pytest.MonkeyPatch, mapping: dict) -> None:
    monkeypatch.setenv("AGENT_MODELS", json.dumps(mapping))
    get_settings.cache_clear()


def test_agent_models_config_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(
        monkeypatch,
        {
            "planner": {"provider": "deepseek", "model": "deepseek-v4-flash"},
            "backend_engineer": {"provider": "qwen", "model": "qwen3.7-flash"},
        },
    )
    settings = get_settings()
    assert settings.agent_models["planner"].provider == "deepseek"
    assert settings.agent_models["planner"].model == "deepseek-v4-flash"
    assert settings.agent_models["backend_engineer"].model == "qwen3.7-flash"


def test_agent_models_empty_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch, {})
    assert get_settings().agent_models == {}


def test_get_agent_provider_routes_via_agent_models(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pytest.importorskip("langchain_openai")
    _configure(
        monkeypatch,
        {
            "planner": {
                "provider": "deepseek",
                "model": "deepseek-v4-flash",
                "api_key": "test-deepseek-key",
            },
            "backend_engineer": {
                "provider": "qwen",
                "model": "qwen3.7-flash",
                "api_key": "test-qwen-key",
            },
        },
    )
    from agency.llm.adapters import LangChainProvider, get_agent_provider

    planner = get_agent_provider("planner")
    assert isinstance(planner, LangChainProvider)
    assert planner.name == "deepseek"
    assert planner.model == "deepseek-v4-flash"

    engineer = get_agent_provider("backend_engineer")
    assert isinstance(engineer, LangChainProvider)
    assert engineer.name == "qwen"
    assert engineer.model == "qwen3.7-flash"


def test_get_agent_provider_falls_back_to_null(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure(monkeypatch, {})
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    from agency.llm.adapters import get_agent_provider
    from agency.llm.provider import NullProvider

    provider = get_agent_provider("planner")
    assert isinstance(provider, NullProvider)
