"""Embedding + vector similarity utilities.

The default implementation is a portable local store (embeddings persisted as
JSON in the database, cosine similarity computed in Python).
"""

from __future__ import annotations

import math
from typing import Any


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
