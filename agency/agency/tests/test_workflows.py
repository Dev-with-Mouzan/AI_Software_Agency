"""Workflow engine tests: command runs, ordering, persistence, plan output."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select

from agency.core.enums import StepStatus, WorkflowStatus
from agency.db.models import WorkflowStep
from agency.workflows.engine import WorkflowError, workflow_engine


async def _steps(db, run) -> list[WorkflowStep]:
    return list(
        (
            await db.scalars(
                select(WorkflowStep)
                .where(WorkflowStep.workflow_run_id == run.id)
                .order_by(WorkflowStep.order_index)
            )
        ).all()
    )


async def test_command_run_completes_and_writes_plan(db, project) -> None:
    run = await workflow_engine.start_command_run(
        db,
        project_id=project.id,
        agents=["planner"],
        command="Build a SaaS landing page",
    )
    assert run.status == WorkflowStatus.COMPLETED.value
    assert run.kind == "command"
    steps = await _steps(db, run)
    assert all(s.status == StepStatus.SUCCEEDED.value for s in steps)

    plan_file = Path(project.root_dir) / "docs" / "implementation_plan.md"
    assert plan_file.exists(), "planner should persist the implementation plan"


async def test_agents_run_in_given_order(db, project) -> None:
    run = await workflow_engine.start_command_run(
        db,
        project_id=project.id,
        agents=["backend_engineer", "frontend_engineer"],
        command="Implement the landing page",
    )
    assert run.status == WorkflowStatus.COMPLETED.value
    ordered = [s.agent_kind for s in await _steps(db, run)]
    assert ordered == ["backend_engineer", "frontend_engineer"]


async def test_unknown_agent_raises(db, project) -> None:
    with pytest.raises(WorkflowError):
        await workflow_engine.start_command_run(
            db, project_id=project.id, agents=["mystery_agent"], command="x"
        )


async def test_run_without_project_fails(db) -> None:
    run = await workflow_engine.start_command_run(
        db, project_id=None, agents=["planner"], command="x"
    )
    assert run.status == WorkflowStatus.FAILED.value


async def test_approve_without_pending_gate_raises(db, project) -> None:
    run = await workflow_engine.start_command_run(
        db, project_id=project.id, agents=["planner"], command="Plan the portal"
    )
    assert run.status == WorkflowStatus.COMPLETED.value
    with pytest.raises(WorkflowError):
        await workflow_engine.approve(db, run.id, decision="approve", actor="human")


async def test_run_context_captures_agent_replies(db, project) -> None:
    run = await workflow_engine.start_command_run(
        db,
        project_id=project.id,
        agents=["planner", "backend_engineer"],
        command="Plan and build an auth API",
    )
    assert run.context.get("planner_reply")
    assert run.context.get("backend_engineer_reply")


async def test_code_reviewer_run_completes(db, project) -> None:
    run = await workflow_engine.start_command_run(
        db,
        project_id=project.id,
        agents=["code_reviewer"],
        command="Review the project for flaws",
    )
    assert run.status == WorkflowStatus.COMPLETED.value
    steps = await _steps(db, run)
    assert [s.agent_kind for s in steps] == ["code_reviewer"]
    assert all(s.status == StepStatus.SUCCEEDED.value for s in steps)
    assert run.context.get("code_reviewer_reply")
