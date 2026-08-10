"""Schemas for runtime LLM settings (Settings tab)."""

from __future__ import annotations

from pydantic import BaseModel, Field

PROVIDER_IDS = ("openai", "gemini", "deepseek", "qwen")


class ProviderConfigIn(BaseModel):
    """Inbound provider config from the Settings form. An empty api_key keeps
    the existing stored key; set `clear_key=True` to remove it."""

    provider: str = Field(pattern="^(openai|gemini|deepseek|qwen)$")
    api_key: str = Field(default="", max_length=400)
    model: str = Field(default="", max_length=120)
    base_url: str = Field(default="", max_length=300)
    clear_key: bool = False


class AgentModelIn(BaseModel):
    """Inbound per-agent model assignment."""

    provider: str = Field(default="", pattern="^(openai|gemini|deepseek|qwen)?$")
    model: str = Field(default="", max_length=120)


class SettingsIn(BaseModel):
    """Full settings payload saved from the Settings tab."""

    default_provider: str = Field(default="", pattern="^(openai|gemini|deepseek|qwen)?$")
    providers: list[ProviderConfigIn] = Field(default_factory=list, max_length=8)
    agents: dict[str, AgentModelIn | None] = Field(default_factory=dict)


class ProviderStatusOut(BaseModel):
    """Read-only view of a provider — never returns the raw API key."""

    provider: str
    label: str
    model: str = ""
    base_url: str = ""
    has_key: bool = False
    key_masked: str = ""


class AgentModelOut(BaseModel):
    """Per-agent effective routing (runtime assignment or resolved default)."""

    kind: str
    name: str
    provider: str = ""
    model: str = ""


class SettingsOut(BaseModel):
    """State the Settings tab renders."""

    configured: bool = False
    default_provider: str = ""
    providers: list[ProviderStatusOut] = Field(default_factory=list)
    agents: list[AgentModelOut] = Field(default_factory=list)


class TestProviderIn(BaseModel):
    """Credentials to validate with a tiny prompt. `api_key` optional — when
    empty the stored/env credentials for the provider are used."""

    provider: str = Field(pattern="^(openai|gemini|deepseek|qwen)$")
    api_key: str = Field(default="", max_length=400)
    model: str = Field(default="", max_length=120)
    base_url: str = Field(default="", max_length=300)


class TestProviderOut(BaseModel):
    ok: bool
    detail: str = ""
