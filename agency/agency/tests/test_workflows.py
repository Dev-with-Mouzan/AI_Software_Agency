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


async def test_recover_stale_runs_fails_only_running(db, project) -> None:
    from agency.workflows.orchestrator import workflow_orchestrator

    stale = await workflow_engine.start_command_run(
        db,
        project_id=project.id,
        agents=["planner", "backend_engineer"],
        command="Build an API",
    )
    paused = await workflow_engine.start_command_run(
        db,
        project_id=project.id,
        agents=["planner"],
        command="Paused plan",
    )
    stale.status = WorkflowStatus.RUNNING.value
    for step in await _steps(db, stale):
        step.status = StepStatus.RUNNING.value
    paused.status = WorkflowStatus.WAITING_HUMAN.value
    await db.commit()

    recovered = await workflow_orchestrator.recover_stale_runs(db)
    assert recovered == 1

    await db.refresh(stale)
    await db.refresh(paused)
    assert stale.status == WorkflowStatus.FAILED.value
    assert stale.result.get("recovered") is True
    assert all(s.status == StepStatus.FAILED.value for s in await _steps(db, stale))
    assert paused.status == WorkflowStatus.WAITING_HUMAN.value


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


async def test_repeated_tool_failures_mark_step_and_run_failed(db, project) -> None:
    """An agent that stops after repeated tool failures must NOT complete.

    Regression: every step used to be marked SUCCEEDED and the run reported
    COMPLETED even though the agent bailed ("Stopped after repeated tool
    failures"). A step that could not do its job must be FAILED, the run must
    be FAILED, and remaining steps must stay PENDING (not run).
    """
    from agency.agents.registry import get_registry
    from agency.llm.provider import BaseLLMProvider, LLMResponse, ToolCall
    from agency.tools.base import Tool, ToolContext, ToolResult

    class AlwaysFailTool(Tool):
        name = "run_command"
        description = "always fails in tests"
        parameters = {
            "type": "object",
            "properties": {"command": {"type": "string"}},
            "required": ["command"],
        }

        async def run(self, ctx: ToolContext, **kwargs) -> ToolResult:
            return ToolResult(False, error="command rejected: boom")

    class AlwaysFailProvider(BaseLLMProvider):
        name = "test-always-fail"
        model = "test"

        async def chat(
            self, messages, tools=None, *, temperature=None, max_tokens=None
        ) -> LLMResponse:
            return LLMResponse(
                text="",
                tool_calls=[
                    ToolCall(id="call_1", name="run_command", arguments={"command": "ls"})
                ],
                finish_reason="tool_calls",
            )

    registry = get_registry()
    planner = registry.get("planner")
    assert planner is not None
    planner.llm = AlwaysFailProvider()
    planner.tool_registry = {**planner.tool_registry, "run_command": AlwaysFailTool()}

    run = await workflow_engine.start_command_run(
        db,
        project_id=project.id,
        agents=["planner", "backend_engineer"],
        command="Build the app",
    )
    assert run.status == WorkflowStatus.FAILED.value
    steps = await _steps(db, run)
    assert steps[0].status == StepStatus.FAILED.value
    assert steps[1].status == StepStatus.PENDING.value
    output = steps[0].output or {}
    assert "boom" in str(output.get("error", ""))


async def test_agent_recovers_by_trying_a_different_method(db, project) -> None:
    """A failed command must not stop the agent if it adapts.

    Regression: agents used to stop after 2 consecutive failures even when
    they switched to a genuinely different approach. Now a failing method only
    accrues toward the stop threshold when the SAME tool keeps failing, so an
    agent that fails run_command and then succeeds with list_dir finishes.
    """
    from agency.agents.registry import get_registry
    from agency.llm.provider import BaseLLMProvider, LLMResponse, ToolCall
    from agency.tools.base import Tool, ToolContext, ToolResult

    class FailRunCommandTool(Tool):
        name = "run_command"
        description = "always fails in tests"
        parameters = {
            "type": "object",
            "properties": {"command": {"type": "string"}},
            "required": ["command"],
        }

        async def run(self, ctx: ToolContext, **kwargs) -> ToolResult:
            return ToolResult(False, error="command rejected: boom")

    class OkListDirTool(Tool):
        name = "list_dir"
        description = "ok in tests"
        parameters = {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        }

        async def run(self, ctx: ToolContext, **kwargs) -> ToolResult:
            return ToolResult(True, output="backend/\nfrontend/")

    class AdaptiveProvider(BaseLLMProvider):
        name = "test-adaptive"
        model = "test"

        def __init__(self) -> None:
            self.calls = 0

        async def chat(
            self, messages, tools=None, *, temperature=None, max_tokens=None
        ) -> LLMResponse:
            self.calls += 1
            if self.calls <= 2:
                return LLMResponse(
                    text="",
                    tool_calls=[
                        ToolCall(id=f"c{self.calls}", name="run_command", arguments={"command": "ls"})
                    ],
                    finish_reason="tool_calls",
                )
            if self.calls == 3:
                return LLMResponse(
                    text="",
                    tool_calls=[ToolCall(id="c3", name="list_dir", arguments={"path": "."})],
                    finish_reason="tool_calls",
                )
            return LLMResponse(text="I inspected the project.", finish_reason="stop")

    registry = get_registry()
    planner = registry.get("planner")
    assert planner is not None
    planner.llm = AdaptiveProvider()
    planner.tool_registry = {
        **planner.tool_registry,
        "run_command": FailRunCommandTool(),
        "list_dir": OkListDirTool(),
    }

    run = await workflow_engine.start_command_run(
        db,
        project_id=project.id,
        agents=["planner", "backend_engineer"],
        command="Inspect the project",
    )
    assert run.status == WorkflowStatus.COMPLETED.value
    steps = await _steps(db, run)
    assert steps[0].status == StepStatus.SUCCEEDED.value
    assert steps[1].status == StepStatus.SUCCEEDED.value
    output = steps[0].output or {}
    stats = output.get("stats", {}) or {}
    assert stats.get("had_failures") is True


async def test_budget_exhaustion_wraps_up_with_final_answer(db, project) -> None:
    """An agent that uses its whole tool budget must still finish if it can
    summarize when asked to wrap up — not fail the run for being productive."""
    from agency.agents.registry import get_registry
    from agency.llm.provider import BaseLLMProvider, LLMResponse, ToolCall
    from agency.tools.base import Tool, ToolContext, ToolResult

    class OkListDirTool(Tool):
        name = "list_dir"
        description = "ok in tests"
        parameters = {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        }

        async def run(self, ctx: ToolContext, **kwargs) -> ToolResult:
            return ToolResult(True, output="backend/\nfrontend/")

    class BudgetProvider(BaseLLMProvider):
        name = "test-budget"
        model = "test"

        async def chat(
            self, messages, tools=None, *, temperature=None, max_tokens=None
        ) -> LLMResponse:
            if messages and str(messages[-1].get("content", "")).startswith(
                "You have used your entire tool budget"
            ):
                return LLMResponse(
                    text="Final summary: built the whole backend.", finish_reason="stop"
                )
            return LLMResponse(
                text="",
                tool_calls=[
                    ToolCall(id="c1", name="list_dir", arguments={"path": "."})
                ],
                finish_reason="tool_calls",
            )

    registry = get_registry()
    planner = registry.get("planner")
    assert planner is not None
    planner._max_rounds = 3  # keep the test fast
    planner.llm = BudgetProvider()
    planner.tool_registry = {**planner.tool_registry, "list_dir": OkListDirTool()}

    run = await workflow_engine.start_command_run(
        db,
        project_id=project.id,
        agents=["planner"],
        command="Inspect the project",
    )
    assert run.status == WorkflowStatus.COMPLETED.value
    steps = await _steps(db, run)
    assert steps[0].status == StepStatus.SUCCEEDED.value
    output = steps[0].output or {}
    assert "Final summary" in str(output.get("reply", ""))
