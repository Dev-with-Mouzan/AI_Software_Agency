"""Test fixtures. Isolated SQLite DB + offline (null) LLM provider."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_agency.db")
os.environ.setdefault("LLM_PROVIDER", "null")
os.environ.setdefault("EMBEDDING_PROVIDER", "local")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("LOG_LEVEL", "ERROR")
# Tests must never pick up per-agent model routing from .env — always offline.
os.environ["AGENT_MODELS"] = "{}"

_TMP_ROOT = tempfile.mkdtemp(prefix="agency_test_")
os.environ["WORKING_AREA"] = str(Path(_TMP_ROOT) / "working-area")


# Tests must never read the developer's real .env (it would leak production
# API keys into the offline test environment and pollute settings like
# AGENT_MODELS). Drop the dotenv file from Settings before any instance is
# built so only the explicit env vars above (and test monkeypatches) apply.
import agency.config as _config  # noqa: E402
from agency.agents.registry import reset_registry  # noqa: E402
from agency.db.base import Base  # noqa: E402
from agency.db.session import dispose_engine, get_engine, get_session_factory, init_db  # noqa: E402
from agency.logging.setup import configure_logging  # noqa: E402

_config.Settings.model_config["env_file"] = None
_config.get_settings.cache_clear()
from agency.config import get_settings  # noqa: E402

configure_logging()


@pytest_asyncio.fixture(autouse=True)
async def _fresh_db():
    """Recreate the schema for every test and reset the agent registry."""
    # Some tests mutate env (e.g. AGENT_MODELS) then monkeypatch reverts it at
    # teardown; the lru_cached Settings would otherwise leak the stale config
    # into the next test's setup. Rebuild settings for every test.
    get_settings.cache_clear()
    await dispose_engine()
    async with get_engine().begin() as conn:
        from agency.db import models  # noqa: F401

        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    reset_registry()
    from agency.services.settings import reset_runtime_settings

    reset_runtime_settings()
    from agency.agents.registry import get_registry

    async with get_session_factory()() as session:
        await get_registry().seed(session)
    yield
    await dispose_engine()


@pytest_asyncio.fixture
async def db():
    """Async database session bound to the test engine."""
    async with get_session_factory()() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client():
    """HTTP client against the FastAPI app (lifespan ran manually)."""
    from agency.api.main import app

    await init_db()
    from agency.agents.registry import get_registry

    async with get_session_factory()() as session:
        await get_registry().seed(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def project(db):
    from agency.services.projects import project_service

    p = await project_service.create(db, name="Test Project", description="integration")
    await db.commit()
    return p
