"""Application configuration.

All settings are loaded from environment variables / `.env` via pydantic-settings.
No secrets are hardcoded — every credential comes from the environment.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class AgentModelConfig(BaseModel):
    """Per-agent LLM routing: which provider and model an agent uses.

    Everything is env-driven (see `AGENT_MODELS` in .env) so models can be
    swapped without touching code. `api_key`/`base_url` default to the
    provider-level settings when omitted.
    """

    provider: str = "deepseek"
    model: str = ""
    base_url: str | None = None
    api_key: str | None = None


class Settings(BaseSettings):
    """Central configuration object for the whole agency."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE if _ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- App ---
    app_name: str = "ai-agency"
    environment: Literal["development", "staging", "production", "test"] = "development"
    log_level: str = "INFO"
    debug: bool = False

    # Paths (resolved relative to repository root)
    working_area: Path = Path("./working-area")
    knowledge_root: Path = Path("./knowledge")
    default_human_approval: bool = True

    # --- API ---
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    api_cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    api_token: str | None = None

    # --- Database ---
    database_url: str = "sqlite+aiosqlite:///./agency_dev.db"
    database_echo: bool = False
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # --- Redis / Celery ---
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"

    # --- Object storage (optional, S3 compatible) ---
    object_storage_endpoint: str | None = None
    object_storage_bucket: str = "agency-artifacts"
    object_storage_access_key: str | None = None
    object_storage_secret_key: str | None = None

    # --- Vector store / embeddings ---
    vector_store_url: str | None = None
    embedding_provider: Literal["", "openai", "huggingface", "local"] = "local"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 768

    # --- LLM ---
    llm_provider: Literal["null", "openai", "anthropic", "gemini", "ollama", "deepseek"] = "null"
    llm_model: str = "gpt-4o"
    llm_temperature: float = 0.2
    llm_max_tokens: int = 4096
    anthropic_model: str = "claude-sonnet-4-20250514"
    gemini_model: str = "gemini-2.5-flash"

    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None

    # --- DeepSeek (OpenAI-compatible) ---
    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-v4-flash"
    deepseek_agents: list[str] = Field(
        default_factory=lambda: [
            "planner",
            "backend_engineer",
            "frontend_engineer",
            "devops_engineer",
            "code_reviewer",
        ]
    )

    # --- Qwen / DashScope (OpenAI-compatible) ---
    qwen_api_key: str | None = None
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen3.7-flash"

    # --- Ollama (local, OpenAI-compatible) ---
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "llama3.2:1b"

    # Per-agent LLM routing, e.g.
    # AGENT_MODELS={"planner":{"provider":"deepseek","model":"deepseek-v4-flash"},
    #              "backend_engineer":{"provider":"qwen","model":"qwen3.7-flash"}}
    # Overrides `deepseek_agents` for the listed agents.
    agent_models: dict[str, AgentModelConfig] = Field(default_factory=dict)

    # --- Observability ---
    langchain_tracing_v2: bool = False
    langchain_api_key: str | None = None
    langchain_project: str = "ai-agency"
    otel_exporter_otlp_endpoint: str | None = None
    prometheus_enabled: bool = True

    # --- Runtime ---
    max_tool_rounds: int = 25
    agent_heartbeat_seconds: int = 30

    @field_validator("working_area", "knowledge_root", mode="before")
    @classmethod
    def _resolve_paths(cls, v: str | Path) -> Path:
        p = Path(v)
        return p if p.is_absolute() else (Path(__file__).resolve().parents[2] / p)

    @property
    def agency_root(self) -> Path:
        """Backwards-compatible alias for the working area root."""
        return self.working_area

    @property
    def is_async_database(self) -> bool:
        return "sqlite+aiosqlite" not in self.database_url or "asyncpg" in self.database_url

    @property
    def cors_origin_list(self) -> list[str]:
        return self.api_cors_origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
