"""Memory endpoints: list, write, and semantic search over agent memory."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from agency.agents.registry import get_registry
from agency.api.deps import CurrentUser, DbSession
from agency.memory.manager import memory_manager
from agency.schemas.agent import (
    AgentMemoryWrite,
    MemoryEntryOut,
    MemorySearchRequest,
    MemorySearchResponse,
)

router = APIRouter(prefix="/memory", tags=["memory"])

MAX_LIST_LIMIT = 200
MAX_WRITE_LENGTH = 20_000


@router.get("", response_model=list[MemoryEntryOut])
async def list_memory(
    session: DbSession,
    user: CurrentUser,
    agent_kind: str | None = None,
    scope_type: str | None = None,
    scope_id: str | None = None,
    limit: int = Query(50, ge=1, le=MAX_LIST_LIMIT),
) -> list[MemoryEntryOut]:
    entries = await memory_manager.list(
        session,
        agent_kind=agent_kind,
        scope_type=scope_type or "",
        scope_id=scope_id or "",
        limit=limit,
    )
    return [MemoryEntryOut.model_validate(e) for e in entries]


@router.post("", response_model=MemoryEntryOut, status_code=201)
async def write_memory(
    payload: AgentMemoryWrite, session: DbSession, user: CurrentUser
) -> MemoryEntryOut:
    registry = get_registry()
    if registry.get(payload.agent_kind) is None:
        raise HTTPException(404, f"unknown agent kind: {payload.agent_kind}")
    if len(payload.content) > MAX_WRITE_LENGTH:
        raise HTTPException(413, f"memory content too long (max {MAX_WRITE_LENGTH} chars)")
    entry = await memory_manager.write(
        session,
        agent_kind=payload.agent_kind,
        content=payload.content,
        kind=payload.kind,
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
        importance=payload.importance,
    )
    await session.commit()
    return MemoryEntryOut.model_validate(entry)


@router.post("/search", response_model=MemorySearchResponse)
async def search_memory(
    payload: MemorySearchRequest, session: DbSession, user: CurrentUser
) -> MemorySearchResponse:
    results = await memory_manager.search(
        session,
        payload.query,
        agent_kind=payload.agent_kind,
        k=payload.k,
    )
    return MemorySearchResponse(query=payload.query, results=results)
