"""Runtime LLM settings: provider credentials + per-agent model routing.

Providers (OpenAI, Gemini, DeepSeek, Qwen) are configured at runtime from the
Settings UI instead of the `.env`. Credentials are persisted to the singleton
`settings` table and mirrored into an in-memory store so the synchronous
provider factory (`agency.llm.adapters.get_agent_provider`) can read them
without awaiting the database. All four providers are integrated through
LangChain (`langchain-openai` / `langchain-google-genai`).

Resolution order for an agent's LLM:
  1. explicit per-agent assignment from the Settings UI,
  2. the default provider chosen in the Settings UI,
  3. env config (`AGENT_MODELS`, `deepseek_agents`, `LLM_PROVIDER`).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from agency.config import get_settings
from agency.db.models import SettingsRecord
from agency.schemas.settings import (
    AgentModelOut,
    ProviderStatusOut,
    SettingsIn,
    SettingsOut,
)

AI_PROVIDER_NOT_CONFIGURED_CODE = "AI_PROVIDER_NOT_CONFIGURED"

AI_PROVIDER_NOT_CONFIGURED_MESSAGE = (
    "AI provider not configured. Add your API key in Settings to run agents."
)


class AIProviderNotConfiguredError(RuntimeError):
    """Raised when an agent/chat/workflow is dispatched without a usable LLM.

    Mapped by the API layer to an HTTP 503 with a machine-readable
    ``code`` (``AI_PROVIDER_NOT_CONFIGURED``) so the frontend can show the
    exact, friendly message instead of a fake success or a raw traceback.
    """

    code = AI_PROVIDER_NOT_CONFIGURED_CODE


PROVIDERS = ("openai", "gemini", "deepseek", "qwen")

PROVIDER_LABELS = {
    "openai": "OpenAI",
    "gemini": "Gemini",
    "deepseek": "DeepSeek",
    "qwen": "Qwen",
    "anthropic": "Anthropic",
    "ollama": "Ollama",
}

DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "gemini": "gemini-2.0-flash",
    "deepseek": "deepseek-chat",
    "qwen": "qwen-plus",
}

DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
}


class RuntimeSettings:
    """In-memory mirror of the persisted SettingsRecord."""

    def __init__(self) -> None:
        self.default_provider: str = ""
        self.providers: dict[str, dict[str, str]] = {}  # provider -> api_key/model/base_url
        self.agents: dict[str, dict[str, str]] = {}  # agent kind -> provider/model


_runtime = RuntimeSettings()


def reset_runtime_settings() -> None:
    global _runtime
    _runtime = RuntimeSettings()


def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "••••"
    return f"{key[:3]}•••{key[-4:]}"


# --- env fallbacks (read-only, only used when the UI hasn't set a value) ---

def _env_credentials(provider: str) -> tuple[str, str]:
    s = get_settings()
    return {
        "openai": (s.openai_api_key or "", ""),
        "gemini": (s.gemini_api_key or "", ""),
        "deepseek": (s.deepseek_api_key or "", s.deepseek_base_url or ""),
        "qwen": (s.qwen_api_key or "", s.qwen_base_url or ""),
        "anthropic": (s.anthropic_api_key or "", ""),
    }.get(provider, ("", ""))


def _env_model(provider: str) -> str:
    s = get_settings()
    return {
        "openai": s.llm_model,
        "gemini": s.gemini_model,
        "deepseek": s.deepseek_model,
        "qwen": s.qwen_model,
    }.get(provider, "")


def provider_key(provider: str) -> str:
    rt = _runtime.providers.get(provider, {})
    env_key, _ = _env_credentials(provider)
    return (rt.get("api_key") or env_key or "")


def provider_model(provider: str) -> str:
    rt = _runtime.providers.get(provider, {})
    return rt.get("model") or _env_model(provider) or DEFAULT_MODELS.get(provider, "")


def provider_base_url(provider: str) -> str:
    rt = _runtime.providers.get(provider, {})
    _, env_url = _env_credentials(provider)
    return rt.get("base_url") or env_url or DEFAULT_BASE_URLS.get(provider, "")


def has_provider(provider: str) -> bool:
    return bool(provider_key(provider))


def any_provider_configured() -> bool:
    """True when at least one usable LLM credential is available (UI or env)."""
    for p in PROVIDERS:
        if has_provider(p):
            return True
    s = get_settings()
    # Anthropic is env-only; Ollama is keyless but must be *explicitly* selected
    # (its base URL has a non-empty default, so it can never count on its own).
    if s.anthropic_api_key or s.llm_provider == "ollama":
        return True
    # Ollama can also be routed per-agent through AGENT_MODELS without a key.
    return any(c.provider == "ollama" for c in s.agent_models.values())


def runtime_default_provider() -> str:
    """Provider name chosen as the default in the Settings UI, or \"\"."""
    if _runtime.default_provider in PROVIDERS:
        return _runtime.default_provider
    return ""


def runtime_agent_assignment(kind: str) -> tuple[str, str] | None:
    """(provider, model) explicitly assigned to an agent in the Settings UI."""
    assignment = _runtime.agents.get(kind) or {}
    if assignment.get("provider") in PROVIDERS:
        return assignment["provider"], (assignment.get("model") or "")
    return None


def ensure_api_configured() -> None:
    """Raise unless a usable AI API key/provider is configured — the gate before
    any agent, chat, workflow or AI-powered action may run.

    No silent offline/demo fallback: a missing key must fail loudly with the
    machine-readable ``AIProviderNotConfiguredError`` so nothing is created,
    modified or reported as completed. The only exception is the explicit test
    environment, where the offline (null) provider is intentionally opted in.
    """
    if any_provider_configured():
        return
    s = get_settings()
    if s.environment == "test" and s.llm_provider in {"null", "mock", "offline"}:
        return
    raise AIProviderNotConfiguredError(AI_PROVIDER_NOT_CONFIGURED_MESSAGE)


# --- per-agent routing --------------------------------------------------

def _env_agent_route(kind: str) -> tuple[str, str]:
    """(provider, model) resolved from env config, or ("", "") when unset."""
    s = get_settings()
    conf = s.agent_models.get(kind)
    if conf is not None:
        return conf.provider, (conf.model or "")
    if s.deepseek_api_key and kind in s.deepseek_agents:
        return "deepseek", (s.deepseek_model or "")
    return "", ""


def effective_agent_route(kind: str) -> tuple[str, str]:
    """Resolved (provider, model) an agent will use, or ("", "") if unconfigured.

    Mirrors the resolution in `agency.llm.adapters.get_agent_provider` without
    constructing a provider client.
    """
    assignment = _runtime.agents.get(kind) or {}
    if assignment.get("provider") in PROVIDERS:
        p = assignment["provider"]
        return p, (assignment.get("model") or provider_model(p))
    if _runtime.default_provider in PROVIDERS and has_provider(_runtime.default_provider):
        p = _runtime.default_provider
        return p, provider_model(p)
    env_p, env_m = _env_agent_route(kind)
    if env_p in PROVIDERS:
        return env_p, (env_m or provider_model(env_p))
    if env_p in {"anthropic", "ollama"}:
        return env_p, (env_m or "")
    s = get_settings()
    if s.llm_provider in PROVIDERS:
        return s.llm_provider, provider_model(s.llm_provider)
    return "", ""


def _agent_name(kind: str) -> str:
    from agency.agents.prompts import AGENT_PROFILES

    profile = AGENT_PROFILES.get(kind, {})
    return profile.get("name") or kind.replace("_", " ").title()


# --- persistence --------------------------------------------------------

def _row_to_runtime(row: SettingsRecord | None) -> RuntimeSettings:
    rt = RuntimeSettings()
    if row is None:
        return rt
    rt.default_provider = row.default_provider or ""
    rt.providers = dict(row.providers or {})
    rt.agents = dict(row.agents or {})
    return rt


async def load_runtime_settings(session: AsyncSession) -> None:
    global _runtime
    row = await session.get(SettingsRecord, 1)
    _runtime = _row_to_runtime(row)


async def update_settings(session: AsyncSession, payload: SettingsIn) -> None:
    """Persist the Settings form, hot-reload the runtime store and rebuild agents."""
    global _runtime
    now = datetime.now(UTC)
    existing = await session.get(SettingsRecord, 1)
    stored = dict(existing.providers or {}) if existing else {}

    providers: dict[str, dict[str, str]] = {}
    for pc in payload.providers:
        prev = stored.get(pc.provider, {})
        key = pc.api_key or ("" if pc.clear_key else (prev.get("api_key") or ""))
        providers[pc.provider] = {
            "api_key": key,
            "model": pc.model or prev.get("model") or "",
            "base_url": pc.base_url or prev.get("base_url") or "",
        }

    agents: dict[str, dict[str, str]] = {}
    for kind, am in (payload.agents or {}).items():
        if am is not None and am.provider in PROVIDERS:
            agents[kind] = {"provider": am.provider, "model": am.model or ""}

    default_provider = payload.default_provider if payload.default_provider in PROVIDERS else ""

    if existing is None:
        session.add(
            SettingsRecord(
                id=1,
                default_provider=default_provider,
                providers=providers,
                agents=agents,
                updated_at=now,
            )
        )
    else:
        existing.default_provider = default_provider
        existing.providers = providers
        existing.agents = agents
        existing.updated_at = now
    await session.commit()

    _runtime = RuntimeSettings()
    _runtime.default_provider = default_provider
    _runtime.providers = providers
    _runtime.agents = agents

    from agency.agents.registry import reset_registry

    reset_registry()


async def get_settings_out(session: AsyncSession) -> SettingsOut:
    from agency.agents.definitions import AGENT_CLASSES

    providers = [
        ProviderStatusOut(
            provider=p,
            label=PROVIDER_LABELS.get(p, p.title()),
            model=provider_model(p),
            base_url=provider_base_url(p),
            has_key=has_provider(p),
            key_masked=mask_key(provider_key(p)),
        )
        for p in PROVIDERS
    ]
    agents = [
        AgentModelOut(
            kind=kind,
            name=_agent_name(kind),
            provider=(route[0] if route else ""),
            model=(route[1] if route else ""),
        )
        for kind in AGENT_CLASSES
        for route in [runtime_agent_assignment(kind)]
    ]
    return SettingsOut(
        configured=any_provider_configured(),
        default_provider=_runtime.default_provider,
        providers=providers,
        agents=agents,
    )
