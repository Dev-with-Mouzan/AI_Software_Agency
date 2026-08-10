"""Initialize the database and seed the AI employees.

Usage:
    uv run python -m scripts.init_db
"""

from __future__ import annotations

import asyncio

from agency.agents.registry import get_registry
from agency.db.session import get_session_factory, init_db
from agency.logging.setup import configure_logging, get_logger


async def main_async() -> None:
    configure_logging()
    log = get_logger("scripts.init_db")
    await init_db()
    async with get_session_factory()() as session:
        await get_registry().seed(session)
    log.info("database initialized and agents seeded")


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
