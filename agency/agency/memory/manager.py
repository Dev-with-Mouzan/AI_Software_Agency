"""Agent memory system.

Each agent has:
- short-term memory: a recent, volatile working context (task-local),
- long-term memory: persistent, embedded memories stored in the database
  (conversation, decisions, architecture, lessons, preferences).

Memory is per-agent but can be scoped to a task or project so that agents
retain project knowledge across conversations.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.core.enums import MemoryKind
from agency.db.models import AgentMemory
from agency.knowledge.vector import rank_records
from agency.llm.adapters import get_embedding

SHORT_TERM_SIZE = 30
SHORT_TERM_TTL = 3600.0  # seconds


class MemoryManager:
    """Coordinates short-term and long-term memory for all agents."""

    def __init__(self) -> None:
        self._short_term: dict[str, deque[dict[str, Any]]] = defaultdict(
            lambda: deque(maxlen=SHORT_TERM_SIZE)
        )
        self._last_seen: dict[str, float] = {}

    # --- short-term -----------------------------------------------------
    def push_short_term(self, agent_kind: str, message: dict[str, Any]) -> None:
        entry = {"ts": time.time(), **message}
        self._short_term[agent_kind].append(entry)
        self._last_seen[agent_kind] = time.time()
        self._evict_expired()

    def short_term(self, agent_kind: str, limit: int = 20) -> list[dict[str, Any]]:
        self._evict_expired()
        return list(self._short_term.get(agent_kind, []))[-limit:]

    def _evict_expired(self) -> None:
        now = time.time()
        for kind in list(self._short_term):
            if now - self._last_seen.get(kind, now) > SHORT_TERM_TTL:
                del self._short_term[kind]

    # --- long-term ------------------------------------------------------
    async def write(
        self,
        session: AsyncSession,
        *,
        agent_kind: str,
        content: str,
        kind: str = MemoryKind.CONVERSATION.value,
        scope_type: str = "",
        scope_id: str = "",
        importance: float = 0.5,
        summary: str = "",
    ) -> AgentMemory:
        embedding = None
        try:
            embedding = await get_embedding(content)
        except Exception:
            embedding = None
        entry = AgentMemory(
            agent_kind=agent_kind,
            kind=kind,
            scope_type=scope_type,
            scope_id=scope_id,
            content=content,
            summary=summary or content[:140],
            importance=importance,
            embedding=embedding,
        )
        session.add(entry)
        await session.flush()
        return entry

    async def search(
        self,
        session: AsyncSession,
        query: str,
        *,
        agent_kind: str | None = None,
        scope_type: str = "",
        scope_id: str = "",
        k: int = 5,
    ) -> list[dict[str, Any]]:
        stmt = select(AgentMemory)
        if agent_kind:
            stmt = stmt.where(AgentMemory.agent_kind == agent_kind)
        if scope_type and scope_id:
            stmt = stmt.where(
                AgentMemory.scope_type == scope_type, AgentMemory.scope_id == scope_id
            )
        rows = list((await session.scalars(stmt.order_by(AgentMemory.created_at.desc()))).all())
        query_embedding = None
        try:
            query_embedding = await get_embedding(query)
        except Exception:
            query_embedding = None
        scored = rank_records(query, query_embedding, rows, k)
        return [
            {
                "agent_kind": r.agent_kind,
                "kind": r.kind,
                "scope_type": r.scope_type,
                "scope_id": r.scope_id,
                "content": r.content,
                "summary": r.summary,
                "importance": r.importance,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "score": round(score, 3),
            }
            for score, r in scored
        ]

    async def list(
        self,
        session: AsyncSession,
        *,
        agent_kind: str | None = None,
        scope_type: str = "",
        scope_id: str = "",
        limit: int = 50,
    ) -> list[AgentMemory]:
        stmt = select(AgentMemory).order_by(AgentMemory.created_at.desc()).limit(limit)
        if agent_kind:
            stmt = stmt.where(AgentMemory.agent_kind == agent_kind)
        if scope_type and scope_id:
            stmt = stmt.where(
                AgentMemory.scope_type == scope_type, AgentMemory.scope_id == scope_id
            )
        return list((await session.scalars(stmt)).all())


memory_manager = MemoryManager()
