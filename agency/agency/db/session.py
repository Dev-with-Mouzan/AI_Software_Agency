"""Async SQLAlchemy engine / session management and schema bootstrap."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from agency.config import get_settings
from agency.db.base import Base

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _create_engine() -> AsyncEngine:
    settings = get_settings()
    kwargs: dict = {"echo": settings.database_echo, "pool_pre_ping": True}
    if settings.database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        kwargs.update(
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
        )
    engine = create_async_engine(settings.database_url, **kwargs)

    if settings.database_url.startswith("sqlite"):
        # Enable foreign keys + WAL for local development parity with Postgres.
        @event.listens_for(engine.sync_engine, "connect")
        def _sqlite_pragmas(dbapi_connection, _record) -> None:  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    return engine


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = _create_engine()
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _session_factory


async def _add_missing_sqlite_columns(conn) -> None:
    """Best-effort migrations for SQLite dev/test DBs.

    `create_all` never alters existing tables, so columns added to the models
    must be patched in-place. No-op on fresh databases (the column already
    exists) and harmless on Postgres (guarded by dialect check).
    """
    if not get_settings().database_url.startswith("sqlite"):
        return

    def _columns(sync_conn, table: str) -> set[str]:
        return {
            row[1] for row in sync_conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
        }

    def _patch(sync_conn) -> None:
        existing = _columns(sync_conn, "projects")
        if existing and "owner_id" not in existing:
            sync_conn.exec_driver_sql("ALTER TABLE projects ADD COLUMN owner_id VARCHAR(36)")

        users = _columns(sync_conn, "users")
        if users:
            if "email_verified" not in users:
                sync_conn.exec_driver_sql(
                    "ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0"
                )
            if "avatar_url" not in users:
                sync_conn.exec_driver_sql("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(300) DEFAULT ''")

    await conn.run_sync(_patch)


async def init_db() -> None:
    """Create all tables. In production use `alembic upgrade head` instead."""
    from agency.db import models  # noqa: F401  (register models)

    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _add_missing_sqlite_columns(conn)


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding an async database session."""
    async with get_session_factory()() as session:
        yield session
