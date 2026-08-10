"""Embedding + vector similarity utilities.

The default implementation is a portable local store (embeddings persisted as
JSON in the database, cosine similarity computed in Python). A pgvector-backed
store is available for production scale and is selected automatically when
`VECTOR_STORE_URL` is configured.
"""

from __future__ import annotations

import math
from typing import Any, Protocol


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def keyword_score(query: str, content: str) -> float:
    """Lexical overlap score used when embeddings are unavailable."""
    q = set(_tokens(query))
    c = set(_tokens(content))
    if not q:
        return 0.0
    return len(q & c) / len(q)


def _tokens(text: str) -> list[str]:
    import re

    return [t for t in re.findall(r"[a-z0-9_]+", text.lower()) if len(t) > 2]


class VectorRecord(Protocol):
    id: str
    content: str
    embedding: list[float] | None
    metadata: dict[str, Any]


def rank_records(
    query: str, query_embedding: list[float] | None, records: list[Any], k: int
) -> list[tuple[float, Any]]:
    """Score records by cosine similarity (embedding) blended with keyword overlap."""
    scored: list[tuple[float, Any]] = []
    for rec in records:
        emb = getattr(rec, "embedding", None)
        sim = cosine_similarity(query_embedding, emb) if query_embedding and emb else 0.0
        lex = keyword_score(query, getattr(rec, "content", "") or getattr(rec, "title", ""))
        scored.append((sim + 0.35 * lex, rec))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[:k]


class PGGVectorStore:
    """Production pgvector store.

    Requires a PostgreSQL instance with the `vector` extension and
    `VECTOR_STORE_URL` set. Uses a dedicated table `knowledge_embeddings`
    managed outside the ORM for native `<=>` similarity search.
    """

    def __init__(self, dsn: str, dim: int = 768) -> None:
        try:
            import psycopg  # type: ignore
            from pgvector.psycopg import register_vector  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Install `psycopg` + `pgvector` to use PGGVectorStore.") from exc
        self.dsn = dsn
        self.dim = dim
        self._conn = psycopg.connect(dsn, autocommit=True)
        self._conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        self._conn.execute(
            f"CREATE TABLE IF NOT EXISTS knowledge_embeddings ("
            f"  id TEXT PRIMARY KEY, "
            f"  content TEXT NOT NULL, "
            f"  embedding vector({dim}), "
            f"  metadata JSONB DEFAULT '{{}}'::jsonb)"
        )
        register_vector(self._conn)

    async def upsert(self, id: str, content: str, embedding: list[float], metadata: dict) -> None:
        import json

        from pgvector.psycopg import Vector  # type: ignore

        self._conn.execute(
            "INSERT INTO knowledge_embeddings (id, content, embedding, metadata) "
            "VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content, "
            "embedding=EXCLUDED.embedding, metadata=EXCLUDED.metadata",
            (id, content, Vector(embedding), json.dumps(metadata)),
        )

    async def search(self, query_embedding: list[float], k: int) -> list[tuple[float, dict]]:
        from pgvector.psycopg import Vector  # type: ignore

        rows = self._conn.execute(
            "SELECT content, metadata, embedding <=> %s AS distance "
            "FROM knowledge_embeddings ORDER BY distance LIMIT %s",
            (Vector(query_embedding), k),
        ).fetchall()
        return [(1.0 - float(r[2]), {"content": r[0], "metadata": r[1]}) for r in rows]

    def close(self) -> None:
        self._conn.close()
