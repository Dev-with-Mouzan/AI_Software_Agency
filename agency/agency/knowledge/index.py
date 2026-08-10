"""RAG knowledge base.

Indexes project files, docs, READMEs and requirements into chunked,
embedded KnowledgeChunk rows, then serves ranked search results that any
agent can query before acting.
"""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.db.models import KnowledgeChunk
from agency.knowledge.vector import PGGVectorStore, rank_records
from agency.llm.adapters import get_embedding

DEFAULT_INCLUDE_EXTS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".md",
    ".txt",
    ".yaml",
    ".yml",
    ".json",
    ".toml",
    ".sql",
}
DEFAULT_IGNORE_DIRS = {
    "node_modules",
    ".next",
    ".venv",
    "venv",
    "__pycache__",
    ".git",
    "dist",
    "build",
    ".pytest_cache",
}
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150


class KnowledgeBase:
    """Chunking + retrieval over the project corpus."""

    def __init__(
        self, project_root: Path | None = None, vector_store: PGGVectorStore | None = None
    ) -> None:
        self.project_root = project_root
        self._pg_store = vector_store

    # --- indexing -------------------------------------------------------
    async def index_project(self, session: AsyncSession, project_id: UUID, root: Path) -> int:
        """Walk `root`, chunk and embed all indexable files."""
        chunks: list[KnowledgeChunk] = []
        for path in _iter_files(root):
            content = _read_text(path)
            if not content:
                continue
            rel = str(path.relative_to(root)).replace("\\", "/")
            for i, chunk in enumerate(_chunk_text(content)):
                embedding = None
                try:
                    embedding = await get_embedding(chunk)
                except Exception:
                    embedding = None
                chunks.append(
                    KnowledgeChunk(
                        project_id=project_id,
                        title=rel,
                        source=rel,
                        content=chunk,
                        metadata_={"chunk_index": i, "path": rel},
                        embedding=embedding,
                    )
                )
                if self._pg_store and embedding:
                    await self._pg_store.upsert(
                        f"{project_id}:{rel}:{i}", chunk, embedding, {"path": rel}
                    )

        if chunks:
            session.add_all(chunks)
            await session.flush()
        return len(chunks)

    async def index_text(
        self,
        session: AsyncSession,
        *,
        title: str,
        source: str,
        content: str,
        project_id: UUID | None = None,
    ) -> None:
        for i, chunk in enumerate(_chunk_text(content)):
            embedding = None
            try:
                embedding = await get_embedding(chunk)
            except Exception:
                embedding = None
            session.add(
                KnowledgeChunk(
                    project_id=project_id,
                    title=title,
                    source=source,
                    content=chunk,
                    metadata_={"chunk_index": i},
                    embedding=embedding,
                )
            )
        await session.flush()

    # --- retrieval ------------------------------------------------------
    async def search(
        self, session: AsyncSession, query: str, *, project_id: UUID | None = None, k: int = 5
    ) -> list[dict]:
        query_embedding = None
        try:
            query_embedding = await get_embedding(query)
        except Exception:
            query_embedding = None

        if self._pg_store and query_embedding:
            results = await self._pg_store.search(query_embedding, k)
            return [
                {
                    "title": r["metadata"].get("path", r["content"][:60]),
                    "content": r["content"],
                    "score": round(score, 3),
                    "source": "vector",
                }
                for score, r in results
            ]

        stmt = select(KnowledgeChunk)
        if project_id is not None:
            stmt = stmt.where(KnowledgeChunk.project_id == project_id)
        rows = list((await session.scalars(stmt)).all())

        scored = rank_records(query, query_embedding, rows, k)
        return [
            {
                "title": r.title,
                "content": r.content,
                "score": round(score, 3),
                "source": r.source,
            }
            for score, r in scored
        ]

    async def stats(self, session: AsyncSession) -> dict[str, int]:
        total = await session.scalar(select(func.count()).select_from(KnowledgeChunk))
        return {"chunks": int(total or 0)}


def _iter_files(root: Path):
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if any(part in DEFAULT_IGNORE_DIRS for part in rel.parts):
            continue
        if path.suffix.lower() in DEFAULT_INCLUDE_EXTS:
            yield path


def _read_text(path: Path, limit: int = 1_000_000) -> str:
    try:
        data = path.read_bytes()[:limit]
        return data.decode("utf-8", errors="ignore")
    except OSError:
        return ""


def _chunk_text(text: str) -> list[str]:
    if len(text) <= CHUNK_SIZE:
        return [text] if text.strip() else []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        if end < len(text):
            split_at = text.rfind("\n", start + 1, end)
            if split_at > start:
                end = split_at
        chunks.append(text[start:end])
        start = end - CHUNK_OVERLAP if end < len(text) else end
    return [c for c in chunks if c.strip()]
