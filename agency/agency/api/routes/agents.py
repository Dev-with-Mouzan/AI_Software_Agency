"""Agent endpoints: registry status, runtime info, command runs."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from agency.agents.registry import get_registry
from agency.api.deps import CurrentUser, DbSession
from agency.api.ownership import require_owned_project
from agency.api.routes.workflows import serialize_workflow_run
from agency.schemas.agent import AgentOut, AgentRunRequest, AgentRuntimeOut
from agency.schemas.workflow import WorkflowRunOut
from agency.workflows.engine import WorkflowError
from agency.workflows.orchestrator import OrchestrationError, workflow_orchestrator

router = APIRouter(prefix="/agents", tags=["agents"])

# Keep a reference to fire-and-forget run tasks so they are not garbage
# collected; tasks are removed from the set when they finish.
_background_tasks: set[asyncio.Task] = set()


def _spawn_background(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


@router.post("/run", response_model=WorkflowRunOut, status_code=201)
async def run_agents(
    payload: AgentRunRequest, session: DbSession, user: CurrentUser
) -> WorkflowRunOut:
    """Dispatch a set of agents; the orchestrator controls the whole workflow.

    The run is created and returned immediately in RUNNING state; the
    orchestrated pipeline (planning, implementation, review loop, deployment)
    executes in the background so the UI can stream live activity.
    """
    if payload.project_id is None:
        raise HTTPException(400, "project_id is required")
    await require_owned_project(session, payload.project_id, user)
    try:
        run = await workflow_orchestrator.prepare(
            session,
            project_id=payload.project_id,
            agents=payload.agents,
            command=payload.command,
            platform=payload.platform,
            plan_source=payload.plan_source,
            actor="human",
        )
    except (OrchestrationError, WorkflowError) as exc:
        raise HTTPException(422, str(exc)) from exc
    _spawn_background(workflow_orchestrator.execute_in_background(run.id))
    return await serialize_workflow_run(session, run)


@router.get("", response_model=list[AgentOut])
async def list_agents(session: DbSession) -> list[AgentOut]:
    registry = get_registry()
    await registry.seed(session)
    from sqlalchemy import select

    from agency.db.models import AgentRecord
    from agency.services import settings as settings_service

    records = list(
        (await session.scalars(select(AgentRecord).order_by(AgentRecord.created_at))).all()
    )
    out: list[AgentOut] = []
    for r in records:
        provider, model = settings_service.effective_agent_route(r.kind)
        out.append(
            AgentOut.model_validate(
                {
                    **r.__dict__,
                    "llm_provider": provider,
                    "llm_model": model,
                }
            )
        )
    return out


@router.get("/runtime", response_model=list[AgentRuntimeOut])
async def agents_runtime(session: DbSession) -> list[AgentRuntimeOut]:
    registry = get_registry()
    statuses = await registry.status(session)
    return [
        AgentRuntimeOut(
            kind=s["kind"],
            name=s["name"],
            status=s["status"],
            short_term=s["short_term"],
            stats={"tools_available": s["tools_available"]},
        )
        for s in statuses
    ]


@router.get("/{kind}/runtime", response_model=AgentRuntimeOut)
async def agent_runtime(kind: str, session: DbSession) -> AgentRuntimeOut:
    registry = get_registry()
    agent = registry.get(kind)
    if agent is None:
        raise HTTPException(404, f"unknown agent kind: {kind}")
    statuses = await registry.status(session)
    match = next((s for s in statuses if s["kind"] == kind), None)
    if match is None:
        raise HTTPException(404, "agent record not found")
    return AgentRuntimeOut(
        kind=kind,
        name=match["name"],
        status=match["status"],
        short_term=match["short_term"],
        stats={"tools_available": match["tools_available"]},
    )
