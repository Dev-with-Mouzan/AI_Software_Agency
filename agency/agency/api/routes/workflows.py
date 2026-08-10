"""Workflow endpoints: list, status, human approval (run history)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from agency.api.deps import DbSession
from agency.db.models import WorkflowRun, WorkflowStep
from agency.schemas.workflow import (
    WorkflowApproveRequest,
    WorkflowRunOut,
    WorkflowStepOut,
)
from agency.workflows.engine import WorkflowError, workflow_engine

router = APIRouter(prefix="/workflows", tags=["workflows"])


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
