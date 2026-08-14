"""Chat endpoint: talk to a specific agent or auto-route to the right one."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from agency.api.deps import CurrentUser, DbSession
from agency.api.ownership import require_owned_project, require_owned_task
from agency.schemas.agent import ChatRequest, ChatResponse
from agency.services.chat import chat

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat_with_agent(
    payload: ChatRequest, session: DbSession, user: CurrentUser
) -> ChatResponse:
    if payload.project_id:
        await require_owned_project(session, payload.project_id, user)
    if payload.task_id:
        await require_owned_task(session, payload.task_id, user)
    try:
        return await chat(
            session,
            message=payload.message,
            project_id=payload.project_id,
            task_id=payload.task_id,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
