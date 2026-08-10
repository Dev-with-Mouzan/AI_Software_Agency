"""Seed deployment template files into the global knowledge base.

Templates live in <repo>/deployment/templates/ and are indexed as global
knowledge chunks (project_id = NULL) so any agent — especially the DevOps
Engineer — can retrieve them via `knowledge_search` and adapt them to a
project's platform.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from agency.db.models import KnowledgeChunk
from agency.knowledge.index import KnowledgeBase

TEMPLATE_PREFIX = "template:"
MAX_FILE_BYTES = 256_000


def templates_root() -> Path:
    return Path(__file__).resolve().parents[3] / "deployment" / "templates"


async def seed_deployment_templates(session: AsyncSession) -> int:
    root = templates_root()
    if not root.is_dir():
        return 0

    # Replace previous template chunks (idempotent).
    await session.execute(
        delete(KnowledgeChunk).where(KnowledgeChunk.source.like(f"{TEMPLATE_PREFIX}%"))
    )

    kb = KnowledgeBase()
    count = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
            content = path.read_bytes().decode("utf-8", errors="ignore")
        except OSError:
            continue
        if not content.strip():
            continue
        rel = path.relative_to(root).as_posix()
        await kb.index_text(
            session,
            title=rel,
            source=f"{TEMPLATE_PREFIX}{rel}",
            content=content,
        )
        count += 1
    await session.commit()
    return count
