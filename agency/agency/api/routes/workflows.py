"""Workflow endpoints: list, status, live activity, human approval."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from agency.api.deps import DbSession
from agency.db.models import WorkflowRun, WorkflowStep
from agency.observability.activity import (
    ActivityEvent,
    activity_store,
)
from agency.schemas.workflow import (
    WorkflowActivityOut,
    WorkflowActivityPage,
    WorkflowApproveRequest,
    WorkflowRunOut,
    WorkflowStepOut,
)
from agency.workflows.engine import WorkflowError, workflow_engine

router = APIRouter(prefix="/workflows", tags=["workflows"])

_ACTIVE_STATUSES = frozenset(
    {"RUNNING", "IN_PROGRESS", "PENDING", "QUEUED", "WAITING"}
)

_SYNTH_STATUS = {
    "SUCCEEDED": "completed",
    "COMPLETED": "completed",
    "FAILED": "failed",
    "REVIEW_FAILED": "failed",
    "RUNNING": "running",
    "IN_PROGRESS": "running",
    "PENDING": "pending",
    "QUEUED": "pending",
    "WAITING": "pending",
    "WAITING_HUMAN": "pending",
}


def _build_synthetic(run: WorkflowRun, steps: list[WorkflowStep]) -> list[ActivityEvent]:
    """Fallback transcript for runs without live events (e.g. pre-restart).

    One section per persisted step, each with a status header and a summary
    row (the agent's final reply or the failure error), so completed runs
    still show every step after the in-memory feed is gone. Stored so
    subsequent polls return the same sequence.
    """
    events: list[ActivityEvent] = []
    for step in steps:
        status = _SYNTH_STATUS.get((step.status or "").upper(), "pending")
        events.append(
            activity_store.add(
                run.id,
                ActivityEvent(
                    run_id=str(run.id),
                    step_id=step.step_id,
                    agent_kind=step.agent_kind or "",
                    agent_name=step.name,
                    kind="step",
                    status=status,
                    message=f"{step.name} — {status}",
                ),
            )
        )
        output = step.output or {}
        reply = str(output.get("reply") or "").strip() if isinstance(output, dict) else ""
        if reply:
            events.append(
                activity_store.add(
                    run.id,
                    ActivityEvent(
                        run_id=str(run.id),
                        step_id=step.step_id,
                        agent_kind=step.agent_kind or "",
                        agent_name=step.name,
                        kind="reasoning",
                        status="completed",
                        message=reply[:300],
                    ),
                )
            )
        elif isinstance(output, dict) and output.get("error"):
            events.append(
                activity_store.add(
                    run.id,
                    ActivityEvent(
                        run_id=str(run.id),
                        step_id=step.step_id,
                        agent_kind=step.agent_kind or "",
                        agent_name=step.name,
                        kind="phase",
                        status="failed",
                        message=str(output["error"])[:300],
                    ),
                )
            )
    return events


async def serialize_workflow_run(session: DbSession, run: WorkflowRun) -> WorkflowRunOut:
    """Serialize a workflow run, loading steps explicitly (async-safe)."""
    steps = list(
        (
            await session.scalars(
                select(WorkflowStep)
                .where(WorkflowStep.workflow_run_id == run.id)
                .order_by(WorkflowStep.order_index)
            )
        ).all()
    )
    # Build from scalar fields to avoid triggering the (async-lazy) relationship.
    scalar = {
        name: getattr(run, name)
        for name in (
            "id",
            "project_id",
            "kind",
            "status",
            "current_step",
            "context",
            "result",
            "started_at",
            "finished_at",
        )
    }
    out = WorkflowRunOut(**scalar)
    out.steps = [WorkflowStepOut.model_validate(s) for s in steps]
    return out


_run_out = serialize_workflow_run


@router.get("", response_model=list[WorkflowRunOut])
async def list_workflows(
    session: DbSession, project_id: UUID | None = None
) -> list[WorkflowRunOut]:
    stmt = select(WorkflowRun).order_by(WorkflowRun.created_at.desc()).limit(100)
    if project_id:
        stmt = stmt.where(WorkflowRun.project_id == project_id)
    runs = list((await session.scalars(stmt)).all())
    return [await _run_out(session, r) for r in runs]


@router.get("/{run_id}", response_model=WorkflowRunOut)
async def get_workflow(run_id: UUID, session: DbSession) -> WorkflowRunOut:
    run = await session.get(WorkflowRun, run_id)
    if run is None:
        raise HTTPException(404, "workflow run not found")
    return await _run_out(session, run)


@router.get("/{run_id}/activity", response_model=WorkflowActivityPage)
async def get_workflow_activity(
    run_id: UUID, session: DbSession, after: int = 0
) -> WorkflowActivityPage:
    """Live activity feed for a run. Fast-polled by the dispatch UI."""
    run = await session.get(WorkflowRun, run_id)
    if run is None:
        raise HTTPException(404, "workflow run not found")

    events = activity_store.since(run_id, after)
    if not events:
        steps = list(
            (
                await session.scalars(
                    select(WorkflowStep)
                    .where(WorkflowStep.workflow_run_id == run.id)
                    .order_by(WorkflowStep.order_index)
                )
            ).all()
        )
        events = _build_synthetic(run, steps)

    return WorkflowActivityPage(
        run_id=str(run.id),
        status=run.status,
        done=run.status.upper() not in _ACTIVE_STATUSES,
        activities=[WorkflowActivityOut.model_validate(e.__dict__) for e in events],
    )


@router.post("/{run_id}/approve", response_model=WorkflowRunOut)
async def approve_workflow(
    run_id: UUID, payload: WorkflowApproveRequest, session: DbSession
) -> WorkflowRunOut:
    try:
        run = await workflow_engine.approve(
            session,
            run_id,
            decision=payload.decision,
            actor=payload.actor,
            comment=payload.comment,
        )
    except WorkflowError as exc:
        raise HTTPException(409, str(exc)) from exc
    return await _run_out(session, run)
