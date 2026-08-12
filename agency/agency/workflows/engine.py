"""Workflow engine — executes command-driven agent runs.

There are no fixed pipelines. A "command run" is an ordered list of agents the
human chooses for a project in the working area; each agent executes as one
step, in the order given. All progress is persisted so runs survive restarts.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.agents.base import AgentRunContext, BaseAgent
from agency.agents.registry import AgentRegistry, get_registry
from agency.core.enums import MemoryKind, StepStatus, WorkflowStatus
from agency.db.models import Project, WorkflowRun, WorkflowStep
from agency.db.session import get_session_factory
from agency.knowledge.index import KnowledgeBase
from agency.observability.activity import ActivityReporter, report_activity
from agency.observability.metrics import WORKFLOW_RUNS
from agency.permissions.audit import record as audit_record

logger = logging.getLogger(__name__)

PLAN_HINT = (
    "Before you act, read docs/implementation_plan.md in the project (if present) — it "
    "contains the implementation plan, tech stack and how the project should work. "
    "Follow it."
)
BACKEND_INSTRUCTIONS = (
    "Implement the complete backend for this project. Read docs/implementation_plan.md "
    "first and follow the chosen tech stack. Build every file the backend needs under "
    "backend/ (API, data models, database setup, configuration, tests, requirements.txt, "
    "README with run instructions). Use make_dir to create directories and write_file to "
    "write each file — do not just describe code. Verify the backend runs if practical "
    "with run_command, then summarize what you built and how to run it."
)
FRONTEND_INSTRUCTIONS = (
    "Design and implement the complete frontend for this project. Read "
    "docs/implementation_plan.md and the backend code under backend/ (especially the API "
    "endpoints) so the UI calls the real API. Build a working, professional frontend "
    "under frontend/ — every file: markup, styles, scripts (e.g. index.html, style.css, "
    "script.js, or the framework files the plan specifies), responsive and accessible. "
    "Write your design plan to docs/design.md as documentation, then IMPLEMENT it: use "
    "make_dir to create directories and write_file to write each real file. Do not stop "
    "after the design document — the actual frontend files under frontend/ are the "
    "deliverable. Use only the filesystem tools (list_dir/read_file/write_file/make_dir) "
    "to do the work; you cannot run shell commands, and you must not touch or test the "
    "backend. Summarize what you built and how to run it."
)
PLANNER_INSTRUCTIONS = (
    "Research the idea on the web with web_search/web_fetch, then produce a complete "
    "implementation plan: product summary, recommended tech stack with justification, "
    "architecture and how it works in reality, and a step-by-step plan. Write the full "
    "plan to docs/implementation_plan.md and summarize it in your reply."
)
DEVOPS_INSTRUCTIONS = (
    "Generate every file needed to deploy this project on the requested platform under "
    "deployment/, plus a plain-language docs/DEPLOYMENT.md telling the human exactly how "
    "to deploy and what secrets/values to set. Search the knowledge base with "
    "knowledge_search for 'deployment template <platform>' (e.g. 'deployment template "
    "railway') and adapt the reference files to this project. Research platform docs on "
    "the web if unsure."
)
REVIEW_INSTRUCTIONS = (
    "Review this project in depth for flaws, loopholes and risks. Read the entire codebase "
    "(backend/, frontend/, deployment/) with the filesystem tools — do not stop at one file. "
    "Audit for: security (injection, broken auth, leaked secrets, unsafe deserialization, "
    "CORS, missing validation), correctness (logic bugs, race conditions, broken edge "
    "cases), robustness (unhandled errors, resource leaks), performance (N+1 queries, "
    "blocking I/O, oversized payloads) and design (coupling, dead code, maintainability, "
    "and any mismatch with the plan in docs/implementation_plan.md). Run the tests and "
    "linters with run_command to confirm suspected breakages. Use web_search/web_fetch to "
    "check current CVEs and known vulnerability patterns for the stack in use. Then write "
    "the full review to docs/code_review.md — one section per severity level (CRITICAL, "
    "HIGH, MEDIUM, LOW), each finding citing the specific file and line, what the flaw is, "
    "why it matters, and a concrete fix. In your reply, summarize the critical and high "
    "findings only. Never modify application code — report only."
)


class WorkflowError(Exception):
    pass


class WorkflowEngine:
    def __init__(self) -> None:
        self._active_runs: set[str] = set()

    # --- lifecycle ------------------------------------------------------
    async def start_command_run(
        self,
        session: AsyncSession,
        *,
        project_id: UUID | None,
        agents: list[str],
        command: str,
        extra: dict[str, Any] | None = None,
        actor: str = "human",
    ) -> WorkflowRun:
        """Create a command run and execute it synchronously (service/tests)."""
        run = await self.prepare_command_run(
            session,
            project_id=project_id,
            agents=agents,
            command=command,
            extra=extra,
            actor=actor,
        )
        return await self.advance(session, run)

    async def prepare_command_run(
        self,
        session: AsyncSession,
        *,
        project_id: UUID | None,
        agents: list[str],
        command: str,
        extra: dict[str, Any] | None = None,
        actor: str = "human",
    ) -> WorkflowRun:
        """Validate a command, persist the run and its steps, then return it.

        The run is created in RUNNING state but not advanced — the caller
        either runs it synchronously (``start_command_run``) or hands it to
        ``execute_in_background`` so the HTTP request returns immediately.
        """
        registry = get_registry()
        for kind in agents:
            if registry.get(kind) is None:
                raise WorkflowError(f"unknown agent kind: {kind}")

        from agency.services import settings as settings_service

        settings_service.ensure_api_configured()

        plan_source = (extra or {}).get("plan_source", "agent")
        if plan_source == "upload":
            if "planner" in agents:
                raise WorkflowError(
                    "the Planner is not needed when a plan is uploaded — remove it "
                    "from the agent list"
                )
            project = await session.get(Project, project_id) if project_id else None
            if project is None:
                raise WorkflowError("select a project before running with an uploaded plan")
            plan_file = Path(project.root_dir) / "docs" / "implementation_plan.md"
            if not plan_file.exists():
                raise WorkflowError(
                    "no plan found for this project — upload one first (POST "
                    "docs/implementation_plan.md via the plan endpoint)"
                )
        elif plan_source != "agent":
            raise WorkflowError(f"unknown plan_source: {plan_source}")

        run = WorkflowRun(
            project_id=project_id,
            kind="command",
            status=WorkflowStatus.RUNNING.value,
            context={"command": command, "plan_source": plan_source, **(extra or {})},
        )
        session.add(run)
        await session.flush()
        for idx, kind in enumerate(agents):
            agent = registry.get(kind)
            session.add(
                WorkflowStep(
                    workflow_run_id=run.id,
                    step_id=f"agent_{idx}",
                    name=agent.name,  # type: ignore[union-attr]
                    handler="agent_run",
                    order_index=idx,
                    status=StepStatus.PENDING.value,
                    agent_kind=kind,
                    detail=command,
                )
            )
        await session.flush()
        await audit_record(
            session,
            actor=actor,
            action="create",
            resource_type="workflow",
            resource_id=str(run.id),
            detail={
                "kind": "command",
                "project_id": str(project_id) if project_id else None,
                "agents": agents,
            },
        )
        WORKFLOW_RUNS.labels(kind="command", outcome="started").inc()
        await session.commit()
        return run

    async def execute_in_background(self, run_id: UUID) -> None:
        """Advance a prepared run on its own DB session, outside the request.

        Runs the whole pipeline to completion in the background so the dispatch
        endpoint returns immediately and the UI can stream live activity.
        """
        key = str(run_id)
        if key in self._active_runs:
            return
        self._active_runs.add(key)
        try:
            async with get_session_factory()() as session:
                run = await session.get(WorkflowRun, run_id)
                if run is None:
                    logger.warning("background workflow %s not found", run_id)
                    return
                if run.status != WorkflowStatus.RUNNING.value:
                    logger.warning(
                        "background workflow %s is not RUNNING (status=%s); skipping",
                        run_id, run.status,
                    )
                    return
                await self.advance(session, run)
        except Exception:
            logger.exception("background workflow %s failed", run_id)
        finally:
            self._active_runs.discard(key)

    async def advance(self, session: AsyncSession, run: WorkflowRun) -> WorkflowRun:
        steps = list(
            (
                await session.scalars(
                    select(WorkflowStep)
                    .where(WorkflowStep.workflow_run_id == run.id)
                    .order_by(WorkflowStep.order_index)
                )
            ).all()
        )

        current = next((s for s in steps if s.status == StepStatus.PENDING.value), None)
        if current is None:
            if run.status != WorkflowStatus.COMPLETED.value:
                run.status = WorkflowStatus.COMPLETED.value
                run.finished_at = datetime.now(UTC)
                report_activity(
                    run.id, kind="run", status="completed",
                    message="Run completed — all steps done.",
                )
                WORKFLOW_RUNS.labels(kind=run.kind, outcome="completed").inc()
                await session.commit()
            return run

        run.current_step = current.step_id
        current.status = StepStatus.RUNNING.value
        current.started_at = datetime.now(UTC)
        run.status = WorkflowStatus.RUNNING.value
        report_activity(
            run.id, kind="step", status="running",
            message=f"{current.name} is on shift.",
            step_id=current.step_id,
            agent_kind=current.agent_kind or "",
            agent_name=current.name,
        )
        await session.flush()

        try:
            await self._dispatch(session, run, current)
            current.status = StepStatus.SUCCEEDED.value
            current.completed_at = datetime.now(UTC)
        except Exception as exc:
            current.status = StepStatus.FAILED.value
            current.output = {"error": str(exc)}
            run.status = WorkflowStatus.FAILED.value
            run.finished_at = datetime.now(UTC)
            report_activity(
                run.id, kind="run", status="failed",
                message="Run failed.",
                step_id=current.step_id,
                agent_kind=current.agent_kind or "",
                agent_name=current.name,
                detail=str(exc)[:300],
            )
            WORKFLOW_RUNS.labels(kind=run.kind, outcome="failed").inc()
            await audit_record(
                session,
                actor="system",
                action="update",
                resource_type="workflow",
                resource_id=str(run.id),
                allowed=False,
                detail={"error": str(exc), "step": current.step_id},
            )
            await session.commit()
            return run

        await session.commit()
        return await self.advance(session, run)

    # --- dispatch -------------------------------------------------------
    async def _dispatch(self, session: AsyncSession, run: WorkflowRun, step: WorkflowStep) -> None:
        if step.handler == "agent_run":
            await self._step_agent_run(session, run, step)
        else:
            raise WorkflowError(f"unknown handler: {step.handler}")

    async def approve(
        self,
        session: AsyncSession,
        run_id: UUID,
        *,
        decision: str,
        actor: str = "human",
        comment: str = "",
    ) -> WorkflowRun:
        """Approve/reject a run waiting on a human gate (reserved for future use)."""
        run = await session.get(WorkflowRun, run_id)
        if run is None:
            raise WorkflowError("workflow run not found")
        step = await session.scalar(
            select(WorkflowStep).where(
                WorkflowStep.workflow_run_id == run.id,
                WorkflowStep.status == StepStatus.WAITING_HUMAN.value,
            )
        )
        if step is None:
            raise WorkflowError("no step is currently waiting for human approval")

        if decision == "reject":
            step.status = StepStatus.FAILED.value
            step.completed_at = datetime.now(UTC)
            run.status = WorkflowStatus.FAILED.value
            run.finished_at = datetime.now(UTC)
            run.result = {**run.result, "rejected": comment}
        else:
            step.status = StepStatus.SUCCEEDED.value
            step.completed_at = datetime.now(UTC)
            step.output = {"approved_by": actor, "comment": comment}
            run.status = WorkflowStatus.RUNNING.value

        await audit_record(
            session,
            actor=actor,
            action="approve" if decision == "approve" else "reject",
            resource_type="workflow",
            resource_id=str(run_id),
            detail={"step": step.step_id, "comment": comment},
        )
        await session.commit()

        if run.status == WorkflowStatus.RUNNING.value:
            return await self.advance(session, run)
        return run

    # --- step handlers --------------------------------------------------
    async def _step_agent_run(
        self, session: AsyncSession, run: WorkflowRun, step: WorkflowStep
    ) -> None:
        project = await self._project(session, run)
        registry = get_registry()
        agent_kind = step.agent_kind or "planner"
        agent = await self._get_agent(registry, agent_kind)

        command = run.context.get("command", "")
        platform = run.context.get("platform", "")

        if agent_kind == "planner":
            instructions = PLANNER_INSTRUCTIONS
        elif agent_kind == "backend_engineer":
            instructions = BACKEND_INSTRUCTIONS
        elif agent_kind == "frontend_engineer":
            instructions = FRONTEND_INSTRUCTIONS
        elif agent_kind == "devops_engineer" and platform:
            instructions = f"Deployment target platform: {platform}.\n\n{DEVOPS_INSTRUCTIONS}"
        elif agent_kind == "code_reviewer":
            instructions = REVIEW_INSTRUCTIONS
        else:
            instructions = PLAN_HINT

        ctx = AgentRunContext(
            session=session,
            project=project,
            user_message=command or "Work on the project in the working area.",
            instructions=instructions,
            workflow_run_id=run.id,
            activity=ActivityReporter(
                run_id=run.id,
                step_id=step.step_id,
                agent_kind=agent_kind,
                agent_name=agent.name,
            ),
            extra={"platform": platform} if platform else {},
        )
        result = await agent.run(ctx)
        if result.failed or result.reply.startswith("Error during execution"):
            ctx.activity.report(  # type: ignore[union-attr]
                "step",
                "failed",
                f"{agent.name} failed this step.",
                detail=result.reply[:300],
            )
            raise WorkflowError(f"agent '{agent_kind}' failed: {result.reply[:2000]}")
        ctx.activity.report(  # type: ignore[union-attr]
            "step",
            "completed",
            f"{agent.name} finished"
            + (" — awaiting human input." if result.needs_human else " this step."),
        )

        step.output = {
            "reply": result.reply[:8000],
            "actions": result.actions,
            "needs_human": result.needs_human,
            "stats": result.stats,
        }
        run.context = {
            **run.context,
            f"{agent_kind}_reply": result.reply[:8000],
        }

        if agent_kind == "planner" and result.reply:
            await self._persist_plan(session, project, result.reply, run)

    # --- helpers --------------------------------------------------------
    async def _get_agent(self, registry: AgentRegistry, agent_kind: str) -> BaseAgent:
        agent = registry.get(agent_kind)
        if agent is None:
            raise WorkflowError(f"unknown agent kind: {agent_kind}")
        return agent

    async def _project(self, session: AsyncSession, run: WorkflowRun) -> Project:
        if run.project_id is None:
            raise WorkflowError("workflow has no project")
        project = await session.get(Project, run.project_id)
        if project is None:
            raise WorkflowError("project not found")
        return project

    async def _persist_plan(
        self, session: AsyncSession, project: Project, reply: str, run: WorkflowRun
    ) -> None:
        """Save the planner's plan to disk, memory and the RAG knowledge base."""
        root = Path(project.root_dir)
        try:
            if root.exists():
                plan_file = root / "docs" / "implementation_plan.md"
                plan_file.parent.mkdir(parents=True, exist_ok=True)
                if not plan_file.exists() and reply:
                    plan_file.write_text(reply, encoding="utf-8")
        except OSError:
            pass

        try:
            kb = KnowledgeBase(project_root=root if root.exists() else None)
            await kb.index_text(
                session,
                title="implementation_plan.md",
                source="docs/implementation_plan.md",
                content=reply,
                project_id=project.id,
            )
        except Exception:
            pass

        registry = get_registry()
        try:
            if registry.memory:
                await registry.memory.write(
                    session,
                    agent_kind="planner",
                    content=reply[:3000],
                    kind=MemoryKind.PROJECT.value,
                    scope_type="project",
                    scope_id=str(project.id),
                    importance=0.9,
                    summary="Implementation plan",
                )
        except Exception:
            pass
        await session.flush()


workflow_engine = WorkflowEngine()
