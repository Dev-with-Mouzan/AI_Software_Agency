"""Chat endpoint: talk to a specific agent or auto-route to the right one."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from agency.api.deps import DbSession
from agency.schemas.agent import ChatRequest, ChatResponse
from agency.services.chat import chat

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat_with_agent(payload: ChatRequest, session: DbSession) -> ChatResponse:
    try:
        return await chat(
            session,
            message=payload.message,
            project_id=payload.project_id,
            task_id=payload.task_id,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
