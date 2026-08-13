"""Workflow Orchestrator.

The orchestrator owns the entire software-generation workflow. Agents never
control the flow — the orchestrator decides execution order, dependencies,
shared state, failures, retries, review loops and completion.

Responsibilities:
  * Build the execution plan from the agents the human selects (dynamic, not a
    hardcoded pipeline).
  * Maintain one shared `WorkflowState` every agent reads and updates.
  * Route Planner architecture output into the project + permission scopes.
  * Run a Code Reviewer review loop: fail -> fix with the responsible agent ->
    re-review, bounded by MAX_REVIEW_RETRIES.
  * Create git checkpoints before major stages and record file deltas.
  * Emit structured workflow events on the activity feed.
  * Produce a final project summary.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.agents.base import AgentRunContext, BaseAgent
from agency.agents.registry import AgentRegistry, get_registry
from agency.config import get_settings
from agency.core.enums import DeploymentStatus, MemoryKind, StepStatus, WorkflowStatus
from agency.db.models import Deployment, Project, WorkflowRun, WorkflowStep
from agency.db.session import get_session_factory
from agency.deployments import (
    DeploymentError,
    ProviderContext,
    ProviderDeployResult,
    get_provider,
    profile_for,
    short_commit,
)
from agency.knowledge.index import KnowledgeBase
from agency.observability.activity import (
    ActivityReporter,
    workflow_event,
)
from agency.observability.metrics import WORKFLOW_RUNS
from agency.permissions.audit import record as audit_record
from agency.workflows.git import checkpoint as git_checkpoint
from agency.workflows.state import WorkflowState

logger = logging.getLogger(__name__)

MAX_STRUCTURED_SCANS = 24
SKIP_DIRS = {".git", ".venv", "node_modules", "__pycache__", ".next", "dist", "build", ".mypy_cache", ".pytest_cache", ".ruff_cache"}


def _short_text(text: str, limit: int = 200) -> str:
    """Collapse arbitrary text to one line for compact records/checkpoints."""
    text = (text or "").strip().replace("\n", " ")
    return text[:limit] + ("…" if len(text) > limit else "")


class OrchestrationError(Exception):
    pass


# ---------------------------------------------------------------------------
# Structured output parsing
# ---------------------------------------------------------------------------


def extract_structured(text: str, required_keys: tuple[str, ...]) -> dict[str, Any] | None:
    """Return the last JSON object in `text` containing every required key.

    Walks every opening brace from right to left and accepts the first
    well-formed block that carries every required key, so deeply nested objects
    (architecture trees, API contracts, issue lists) parse correctly without
    corrupting their inner structure.
    """
    if not text:
        return None
    idx = text.rfind("{")
    scanned = 0
    while idx != -1 and scanned < MAX_STRUCTURED_SCANS:
        block, _ = _balanced_block(text, idx)
        if block is not None:
            scanned += 1
            try:
                obj = json.loads(block)
            except json.JSONDecodeError:
                obj = None
            if isinstance(obj, dict) and all(key in obj for key in required_keys):
                return obj
        idx = text.rfind("{", 0, idx)
    return None


def _balanced_block(text: str, open_index: int) -> tuple[str | None, str]:
    depth = 0
    in_string = False
    escape = False
    for i in range(open_index, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[open_index : i + 1], text[:open_index] + text[i + 1 :]
    return None, text


# ---------------------------------------------------------------------------
# Agent instructions
# ---------------------------------------------------------------------------

EXECUTION_PROTOCOL = (
    "## Operating protocol — follow this on every task.\n"
    "1. UNDERSTAND ONCE: read the request once; extract requirements, constraints "
    "and acceptance criteria. Do not keep reinterpreting the same request.\n"
    "2. INSPECT MINIMALLY: open only the files relevant to your task. Never reread "
    "unchanged files.\n"
    "3. PLAN BRIEFLY: a compact plan (max 5 steps), no obvious details, no "
    "unnecessary prose.\n"
    "4. EXECUTE DIRECTLY: edit existing files; reuse existing components, utilities, "
    "styles and patterns. Never create duplicate functionality. Do not redesign "
    "unrelated parts.\n"
    "5. CONTEXT EFFICIENCY: pass only relevant context between steps — never full "
    "project contents or verbose explanations.\n"
    "6. TOOL EFFICIENCY: use the minimum tool calls; batch related reads/searches; "
    "stop as soon as your acceptance criteria and required checks pass.\n"
    "7. REVIEW LOOP: if the reviewer fails you, fix ONLY the reported issues and let "
    "it re-check the changed files. Never restart the whole workflow. Maximum "
    "retries: 2 unless configured otherwise.\n"
    "8. OUTPUT EFFICIENCY: no motivational text, repeated summaries, or speculative "
    "alternatives.\n"
    "9. ERROR HANDLING: identify the root cause, fix it directly, rerun only the "
    "affected validation — never restart unrelated work.\n"
)

PLANNER_INSTRUCTIONS = (
    EXECUTION_PROTOCOL
    + "Research the idea (web_search/web_fetch when useful), then design the ARCHITECTURE "
    "before any implementation. Decide: project type, technology stack (frontend, backend, "
    "database, auth), architecture, API structure, testing strategy, deployment strategy, "
    "environment configuration, directory structure, required files and dependencies. "
    "Choose an intentional structure for THIS project — do NOT blindly create "
    "backend/frontend/deployment/docs for everything. A full-stack app may use "
    "apps/web + apps/api + packages/shared + infra; a Python CLI or ML project or a "
    "single-page frontend needs its own appropriate layout.\n"
    "Write the plan to docs/implementation_plan.md AND docs/architecture.json.\n"
    "Then end your reply with exactly one JSON object on its own line containing:\n"
    '{"architecture": {project_type, technology_stack, architecture, api, database, auth, '
    'testing, deployment}, "directories": {backend, frontend, infra, docs, tests, shared}, '
    '"project_structure": {tree}, "tasks": [...], "dependencies": [...]}'
)

IMPLEMENT_INSTRUCTIONS = (
    EXECUTION_PROTOCOL
    + "You are implementing one stage of an orchestrated build. Follow the Planner's "
    "architecture in docs/architecture.json and docs/implementation_plan.md EXACTLY — "
    "do not invent a new layout. SAFETY: first list_dir/read_file the existing project; "
    "reuse existing directories and files, never create random root folders, never "
    "overwrite unrelated files, and keep the architecture consistent. Build every file "
    "you are responsible for with make_dir + write_file (do not just describe code), "
    "run tests/linters when practical, then end your reply with one JSON object: "
    '{"summary": "...", "files": ["path", ...], "notes": [...]}'
)

REVIEW_INSTRUCTIONS = (
    EXECUTION_PROTOCOL
    + "Review the ACTUAL code that was generated/modified in this run (not the plan). "
    "Use list_dir/read_file across the project and run_command for tests/linters when "
    "useful. Audit: architecture, correctness, bugs, security, API contracts, error "
    "handling, testing, performance, dependency issues, frontend/backend integration, "
    "DevOps configuration. Never modify code.\n"
    "End your reply with exactly one JSON object containing: {\"status\": \"passed\"|"
    "\"failed\", \"score\": 0-100, \"issues\": [{\"severity\": \"critical\"|\"high\"|"
    "\"medium\"|\"low\"|\"suggestion\", \"file\": \"...\", \"line\": 0, \"title\": "
    "\"...\", \"why\": \"...\", \"fix\": \"...\", \"agent\": \"backend_engineer\"|"
    "\"frontend_engineer\"|\"devops_engineer\"}], \"files_reviewed\": [\"...\"], "
    "\"required_fixes\": [\"backend_engineer\", ...], \"summary\": \"...\"}. "
    "Report only — the orchestrator decides who fixes what."
)

FIX_INSTRUCTIONS = (
    EXECUTION_PROTOCOL
    + "A code review FAILED on the work you produced. Read docs/code_review.md and the "
    "review result (in the workflow context), then fix the critical/high issues the "
    "reviewer flagged — the exact files and lines it cited. Do not rewrite unrelated "
    "code. Run tests/linters to confirm your fix, then end your reply with one JSON "
    'object: {"summary": "...", "fixed": ["path", ...], "notes": [...]}'
)

DEVOPS_INSTRUCTIONS = (
    EXECUTION_PROTOCOL
    + "Generate deployment/infrastructure for this project following the Planner's "
    "architecture (docs/architecture.json). Create Docker, CI/CD, environment templates "
    "and docs/DEPLOYMENT.md under the infra directory the architecture defines. Only "
    "generate what the project actually needs. End your reply with one JSON object: "
    '{"summary": "...", "files": ["path", ...], "platform": "..."}'
)

_INSTRUCTIONS: dict[str, str] = {
    "planner": PLANNER_INSTRUCTIONS,
    "backend_engineer": IMPLEMENT_INSTRUCTIONS,
    "frontend_engineer": IMPLEMENT_INSTRUCTIONS,
    "devops_engineer": DEVOPS_INSTRUCTIONS,
    "code_reviewer": REVIEW_INSTRUCTIONS,
}

_PLAN_SOURCE_MSG = {
    "upload": "The human already uploaded a plan; read docs/implementation_plan.md and "
    "follow it. The Planner does not run in this workflow.",
}


class WorkflowOrchestrator:
    def __init__(self) -> None:
        self._active_runs: set[str] = set()

    # --- lifecycle ------------------------------------------------------
    async def prepare(
        self,
        session: AsyncSession,
        *,
        project_id: UUID | None,
        agents: list[str],
        command: str,
        platform: str | None = None,
        plan_source: str = "agent",
        actor: str = "human",
    ) -> WorkflowRun:
        """Validate the request and persist the run + initial step plan."""
        agents = list(dict.fromkeys(agents))  # planner/agents never run twice (rule 14)
        registry = get_registry()
        for kind in agents:
            if registry.get(kind) is None:
                raise OrchestrationError(f"unknown agent kind: {kind}")

        from agency.services import settings as settings_service

        settings_service.ensure_api_configured()

        if plan_source == "upload":
            if "planner" in agents:
                raise OrchestrationError(
                    "the Planner is not needed when a plan is uploaded — remove it "
                    "from the agent list"
                )
            project = await session.get(Project, project_id) if project_id else None
            if project is None:
                raise OrchestrationError(
                    "select a project before running with an uploaded plan"
                )
            plan_file = Path(project.root_dir) / "docs" / "implementation_plan.md"
            if not plan_file.exists():
                raise OrchestrationError(
                    "no plan found for this project — upload one first"
                )
        elif plan_source != "agent":
            raise OrchestrationError(f"unknown plan_source: {plan_source}")

        state = WorkflowState(
            project_request=command,
            workflow_status="running",
            review_retries_left=get_settings().max_review_retries,
        )

        run = WorkflowRun(
            project_id=project_id,
            kind="command",
            status=WorkflowStatus.RUNNING.value,
            context={
                "command": command,
                "plan_source": plan_source,
                "platform": platform or "",
                "workflow_state": state.as_dict(),
            },
        )
        session.add(run)
        await session.flush()

        for idx, plan in enumerate(self._plan_steps(agents, registry)):
            agent = registry.get(plan["agent_kind"])
            session.add(
                WorkflowStep(
                    workflow_run_id=run.id,
                    step_id=f"agent_{idx}",
                    name=agent.name if agent else plan["name"],  # type: ignore[union-attr]
                    handler=plan["handler"],
                    order_index=idx,
                    status=StepStatus.PENDING.value,
                    agent_kind=plan["agent_kind"],
                    detail=plan["detail"],
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
        workflow_event(
            run.id,
            "workflow.started",
            message=f"Workflow started — {len(agents)} agent(s): {', '.join(agents)}.",
            metadata={"agents": agents, "command": command},
        )
        await session.commit()
        return run

    async def prepare_deploy(
        self,
        session: AsyncSession,
        *,
        project: Project,
        deployment: Deployment,
        provider: str,
        environment: str,
        actor: str = "human",
    ) -> WorkflowRun:
        """Persist a deploy run with the standard deploy step plan.

        Deployment never runs alongside generation: it is its own workflow
        (validate → build → deploy → verify) driven by the same orchestrator
        loop, so progress streams over the activity feed like any other run.
        """
        from agency.services import settings as settings_service

        settings_service.ensure_api_configured()
        run = WorkflowRun(
            project_id=project.id,
            kind="deploy",
            status=WorkflowStatus.RUNNING.value,
            context={
                "command": f"Deploy {project.name} to {provider} ({environment})",
                "provider": provider,
                "environment": environment,
                "deployment_id": str(deployment.id),
                "workflow_state": WorkflowState(
                    project_request=f"Deploy {project.name}",
                    workflow_status="running",
                ).as_dict(),
            },
        )
        session.add(run)
        await session.flush()

        steps = [
            ("deploy_validate", "Validate project", "Compatibility, configuration and code-quality gate"),
            ("deploy_build", "Build", "Prepare the deployable build"),
            ("deploy_go", "Deploy", "Ship to the provider"),
            ("deploy_verify", "Verify", "Confirm the deployment is live"),
        ]
        for idx, (step_id, name, detail) in enumerate(steps):
            session.add(
                WorkflowStep(
                    workflow_run_id=run.id,
                    step_id=step_id,
                    name=name,
                    handler="deploy_step",
                    order_index=idx,
                    status=StepStatus.PENDING.value,
                    agent_kind="devops_engineer",
                    detail=detail,
                )
            )
        await session.flush()

        deployment.run_id = str(run.id)
        await audit_record(
            session,
            actor=actor,
            action="create",
            resource_type="deployment",
            resource_id=str(deployment.id),
            detail={"provider": provider, "environment": environment, "run_id": str(run.id)},
        )
        workflow_event(
            run.id,
            "workflow.started",
            message=f"Deployment started — {provider} · {environment}.",
            metadata={"provider": provider, "environment": environment},
        )
        WORKFLOW_RUNS.labels(kind="deploy", outcome="started").inc()
        await session.commit()
        return run

    async def execute_in_background(self, run_id: UUID) -> None:
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
                    return
                await self.execute(session, run)
        except Exception:
            logger.exception("background workflow %s failed", run_id)
        finally:
            self._active_runs.discard(key)

    @staticmethod
    async def recover_stale_runs(session: AsyncSession) -> int:
        """Fail runs left in RUNNING state by a crashed/restarted process.

        Called once at startup. Only RUNNING rows are touched; WAITING_HUMAN
        runs are intentionally paused and never modified. Pending steps of the
        affected run stay PENDING so a future re-run can resume from the top.
        """
        runs = list(
            (
                await session.scalars(
                    select(WorkflowRun).where(
                        WorkflowRun.status == WorkflowStatus.RUNNING.value
                    )
                )
            ).all()
        )
        now = datetime.now(UTC)
        for run in runs:
            run.status = WorkflowStatus.FAILED.value
            run.finished_at = now
            run.result = {
                **(run.result or {}),
                "recovered": True,
                "reason": "process restarted mid-run",
            }
            for step in run.steps:
                if step.status == StepStatus.RUNNING.value:
                    step.status = StepStatus.FAILED.value
                    step.completed_at = now
                    step.output = {
                        **(step.output or {}),
                        "error": "process restarted mid-run",
                    }
        await session.flush()
        return len(runs)

    async def execute(self, session: AsyncSession, run: WorkflowRun) -> WorkflowRun:
        """Drive the whole run to completion on the caller's session."""
        settings = get_settings()
        state = WorkflowState.from_dict(run.context.get("workflow_state"))
        if state.review_retries_left <= 0:
            state.review_retries_left = settings.max_review_retries

        snapshot: dict[str, tuple[int, int]] = {}

        while True:
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
                break

            run.current_step = current.step_id
            current.status = StepStatus.RUNNING.value
            current.started_at = datetime.now(UTC)
            run.status = WorkflowStatus.RUNNING.value
            workflow_event(
                run.id,
                "agent.started",
                step_id=current.step_id,
                agent_kind=current.agent_kind or "",
                agent_name=current.name,
                message=f"{current.name} is on shift.",
            )
            await session.flush()

            try:
                outcome = await self._dispatch(session, run, current, state, snapshot)
                current.status = StepStatus.SUCCEEDED.value
                current.completed_at = datetime.now(UTC)
                current.output = {
                    **(current.output or {}),
                    **(outcome or {}),
                }
                self._persist_state(session, run, state)
                await session.flush()
                # Generic per-step completion event so the UI always reflects
                # the final status (covers reviewers/deploy steps that don't
                # emit their own). Idempotent when the handler already did.
                workflow_event(
                    run.id,
                    "agent.completed",
                    step_id=current.step_id,
                    agent_kind=current.agent_kind or "",
                    agent_name=current.name,
                    message=f"{current.name} finished this step.",
                )
            except Exception as exc:
                current.status = StepStatus.FAILED.value
                current.completed_at = datetime.now(UTC)
                current.output = {"error": str(exc)}
                workflow_event(
                    run.id,
                    "agent.failed",
                    step_id=current.step_id,
                    agent_kind=current.agent_kind or "",
                    agent_name=current.name,
                    message=f"{current.name} failed this step.",
                    detail=str(exc)[:300],
                )
                state.errors.append(str(exc))
                run.status = WorkflowStatus.FAILED.value
                run.finished_at = datetime.now(UTC)
                self._persist_state(session, run, state)
                workflow_event(
                    run.id,
                    "workflow.failed",
                    step_id=current.step_id,
                    agent_kind=current.agent_kind or "",
                    agent_name=current.name,
                    message="Workflow failed.",
                    detail=str(exc)[:300],
                )
                WORKFLOW_RUNS.labels(kind=run.kind, outcome="failed").inc()
                await session.commit()
                return run

            # Review loop: if a review failed and retries remain, schedule the
            # responsible agent's fix + a re-review right after this step.
            review = state.review_results[-1] if state.review_results else None
            if (
                current.agent_kind == "code_reviewer"
                and review
                and str(review.get("status", "")).lower() == "failed"
            ):
                if state.review_retries_left > 0:
                    await self._schedule_review_retry(session, run, current, state, steps)
                    state.review_attempts += 1
                    state.review_retries_left -= 1
                    self._persist_state(session, run, state)
                    await session.commit()
                    continue
                # Budget exhausted: stop with REVIEW_FAILED.
                run.status = WorkflowStatus.REVIEW_FAILED.value
                run.finished_at = datetime.now(UTC)
                run.result = {
                    **run.result,
                    "review": review,
                    "review_failed": True,
                }
                self._persist_state(session, run, state)
                workflow_event(
                    run.id,
                    "workflow.review_failed",
                    step_id=current.step_id,
                    agent_kind="code_reviewer",
                    agent_name="Code Reviewer",
                    message=(
                        "Review failed after all fix attempts — see the review report."
                    ),
                    metadata={"attempts": state.review_attempts},
                )
                await self._notify_review_failed(session, run, review)
                await session.commit()
                return run

            await session.commit()

        # All steps done.
        run.status = WorkflowStatus.COMPLETED.value
        run.finished_at = datetime.now(UTC)
        state.workflow_status = "completed"
        run.result = {
            **run.result,
            "summary": self._build_summary(run, state, steps),
            "review": state.review_results[-1] if state.review_results else None,
            "workflow_state": state.as_dict(),
        }
        self._persist_state(session, run, state)
        workflow_event(
            run.id,
            "workflow.completed",
            message="Workflow completed — every stage finished.",
        )
        WORKFLOW_RUNS.labels(kind=run.kind, outcome="completed").inc()
        await session.commit()
        return run

    # --- plan -----------------------------------------------------------
    def _plan_steps(self, agents: list[str], registry: AgentRegistry) -> list[dict[str, str]]:
        """Turn the selected agents into an orchestrated execution plan.

        Canonical order: Planner → implementation agents (user order) → Code
        Reviewer → DevOps. This keeps review before deployment so DevOps only
        ships reviewed work, matching the reference workflows.
        """
        plan: list[dict[str, str]] = []
        if "planner" in agents:
            plan.append(
                {
                    "step_id": "planner",
                    "name": "Planner",
                    "handler": "agent_run",
                    "agent_kind": "planner",
                    "detail": "Architecture & implementation plan",
                }
            )
        for kind in agents:
            if kind in {"planner", "code_reviewer", "devops_engineer"}:
                continue
            agent = registry.get(kind)
            plan.append(
                {
                    "step_id": f"{kind}",
                    "name": agent.name if agent else kind,  # type: ignore[union-attr]
                    "handler": "agent_run",
                    "agent_kind": kind,
                    "detail": "Implement per the architecture",
                }
            )
        if "code_reviewer" in agents:
            plan.append(
                {
                    "step_id": "code_review",
                    "name": "Code Reviewer",
                    "handler": "review_run",
                    "agent_kind": "code_reviewer",
                    "detail": "Review generated code",
                }
            )
        if "devops_engineer" in agents:
            plan.append(
                {
                    "step_id": "devops",
                    "name": "DevOps Engineer",
                    "handler": "agent_run",
                    "agent_kind": "devops_engineer",
                    "detail": "Deployment configuration",
                }
            )
        return plan

    async def _schedule_review_retry(
        self,
        session: AsyncSession,
        run: WorkflowRun,
        failed_review: WorkflowStep,
        state: WorkflowState,
        steps: list[WorkflowStep],
    ) -> None:
        """Insert fix + re-review steps directly after the failed review."""
        review = state.review_results[-1]
        fixers = [
            a
            for a in (review.get("required_fixes") or [])
            if isinstance(a, str) and a != "code_reviewer"
        ]
        if not fixers:
            # Default: every implementation agent that ran this workflow.
            ran = {s.agent_kind for s in steps if s.agent_kind not in ("planner", "code_reviewer", None)}
            fixers = sorted(ran)
        if not fixers:
            fixers = ["backend_engineer"]

        base_index = failed_review.order_index
        # Shift later steps to make room for the inserted retry steps.
        later = [s for s in steps if s.order_index > base_index]
        for step in later:
            step.order_index += len(fixers) + 1

        registry = get_registry()
        offset = base_index + 1
        for kind in fixers[:3]:
            agent = registry.get(kind)
            session.add(
                WorkflowStep(
                    workflow_run_id=run.id,
                    step_id=f"fix_{kind}_{state.review_attempts}",
                    name=f"{agent.name if agent else kind} (fix)" if agent else f"{kind} (fix)",  # type: ignore[union-attr]
                    handler="review_fix",
                    order_index=offset,
                    status=StepStatus.PENDING.value,
                    agent_kind=kind,
                    detail="Fix review findings",
                )
            )
            offset += 1
        session.add(
            WorkflowStep(
                workflow_run_id=run.id,
                step_id=f"re_review_{state.review_attempts}",
                name="Code Reviewer",
                handler="review_run",
                order_index=offset,
                status=StepStatus.PENDING.value,
                agent_kind="code_reviewer",
                detail="Re-review after fixes",
            )
        )
        workflow_event(
            run.id,
            "review.retry_started",
            step_id=failed_review.step_id,
            agent_kind="code_reviewer",
            agent_name="Code Reviewer",
            message=f"Review failed — {', '.join(fixers[:3])} fixing, then re-review.",
            metadata={"attempt": state.review_attempts + 1, "fixers": fixers[:3]},
        )

    # --- dispatch -------------------------------------------------------
    async def _dispatch(
        self,
        session: AsyncSession,
        run: WorkflowRun,
        step: WorkflowStep,
        state: WorkflowState,
        snapshot: dict[str, tuple[int, int]],
    ) -> dict[str, Any]:
        kind = step.agent_kind or "planner"
        # Re-check before every step: if the API key was cleared mid-run the
        # step must fail loudly instead of running against a null provider.
        from agency.services import settings as settings_service

        settings_service.ensure_api_configured()
        if step.handler == "review_run" or kind == "code_reviewer":
            return await self._run_review(session, run, step, state)
        if step.handler == "review_fix":
            return await self._run_fix(session, run, step, state)
        if step.handler == "deploy_step":
            return await self._run_deploy_step(session, run, step)
        return await self._run_agent(session, run, step, state, snapshot)

    async def _run_agent(
        self,
        session: AsyncSession,
        run: WorkflowRun,
        step: WorkflowStep,
        state: WorkflowState,
        snapshot: dict[str, tuple[int, int]],
    ) -> dict[str, Any]:
        kind = step.agent_kind or "planner"
        registry = get_registry()
        agent = self._get_agent(registry, kind)
        project = await self._project(session, run)

        workflow_event(
            run.id,
            "agent.started",
            step_id=step.step_id,
            agent_kind=kind,
            agent_name=agent.name,
            message=f"{agent.name} started this step.",
        )

        # Git checkpoint before major implementation stages.
        if kind in {"planner", "backend_engineer", "frontend_engineer", "devops_engineer"}:
            ckpt = await self._checkpoint(project, state, label=f"before {kind}")
            if ckpt.get("created"):
                workflow_event(
                    run.id,
                    "workflow.checkpoint",
                    step_id=step.step_id,
                    agent_kind=kind,
                    agent_name=agent.name,
                    message=f"Checkpoint created ({ckpt.get('commit')}) before {kind}.",
                )

        before = self._snapshot(project.root_dir) if kind != "planner" else None
        instructions = self._instructions_for(run, kind, state)

        ctx = AgentRunContext(
            session=session,
            project=project,
            user_message=state.project_request or "Work on the project in the working area.",
            instructions=instructions,
            workflow_run_id=run.id,
            activity=ActivityReporter(
                run_id=run.id,
                step_id=step.step_id,
                agent_kind=kind,
                agent_name=agent.name,
            ),
            write_dirs=state.write_dirs_for(kind),
            extra={**self._agent_context(state, kind), "platform": run.context.get("platform", "")},
        )
        result = await agent.run(ctx)

        if result.failed or result.reply.startswith("Error during execution"):
            ctx.activity.report(  # type: ignore[union-attr]
                "step", "failed", f"{agent.name} failed this step.", detail=result.reply[:300]
            )
            raise OrchestrationError(f"agent '{kind}' failed: {result.reply[:2000]}")

        ctx.activity.report("step", "completed", f"{agent.name} finished this step.")

        required = ("architecture",) if kind == "planner" else ("summary",)
        structured = extract_structured(result.reply, required)

        created: list[str] = []
        modified: list[str] = []
        deleted: list[str] = []
        if before is not None:
            after = self._snapshot(project.root_dir)
            created, modified, deleted = self._diff_files(before, after)
            self._record_files(state, created, modified, deleted, kind, run, step.step_id, step.name)

        # Remember which files this agent actually inspected so downstream
        # agents reuse the results instead of re-reading them (rule 13).
        self._record_inspected(state, result.actions)

        # Compact result in shared state — never the full LLM response (rule 12).
        # Downstream agents consume the summary/plan slices, not the transcript.
        output: dict[str, Any] = {
            "status": "completed",
            "summary": _short_text((structured or {}).get("summary") or result.reply),
            "files_created": created,
            "files_modified": modified,
            "files_deleted": deleted,
            "structured": structured or {},
        }
        state.agent_outputs[kind] = output
        state.workflow_status = "running"

        if kind == "planner":
            await self._absorb_architecture(session, run, state, result.reply, structured, step)
        else:
            # Adopt any planner-defined architecture file produced previously.
            await self._ensure_architecture_json(project, state)
        return output

    async def _run_review(
        self,
        session: AsyncSession,
        run: WorkflowRun,
        step: WorkflowStep,
        state: WorkflowState,
    ) -> dict[str, Any]:
        registry = get_registry()
        agent = self._get_agent(registry, "code_reviewer")
        project = await self._project(session, run)

        review_targets = "\n".join(f"- {f}" for f in (state.files_created + state.files_modified)[-50:])
        ctx = AgentRunContext(
            session=session,
            project=project,
            user_message=(
                f"Review the work generated for: {state.project_request}\n"
                f"Files changed this run:\n{review_targets or '(none recorded)'}"
                f"{self._reviewer_spec(state)}"
            ),
            instructions=REVIEW_INSTRUCTIONS,
            workflow_run_id=run.id,
            activity=ActivityReporter(
                run_id=run.id,
                step_id=step.step_id,
                agent_kind="code_reviewer",
                agent_name=agent.name,
            ),
            write_dirs=state.write_dirs_for("code_reviewer"),
            extra=self._agent_context(state, "code_reviewer"),
        )
        workflow_event(
            run.id,
            "review.started",
            step_id=step.step_id,
            agent_kind="code_reviewer",
            agent_name=agent.name,
            message="Code Reviewer is auditing the generated code.",
        )
        result = await agent.run(ctx)

        if result.failed or result.reply.startswith("Error during execution"):
            raise OrchestrationError(f"code_reviewer failed: {result.reply[:2000]}")

        review = self._coerce_review(extract_structured(result.reply, ("status", "score")), result.reply)
        state.review_results.append(review)
        state.review_attempts = max(state.review_attempts, len(state.review_results) - 1)
        run.result = {**run.result, "review": review}

        self._write_review_doc(project, review)
        status = str(review.get("status", "passed")).lower()
        if status == "failed":
            workflow_event(
                run.id,
                "review.failed",
                step_id=step.step_id,
                agent_kind="code_reviewer",
                agent_name=agent.name,
                message=f"Review failed — score {review.get('score')}.",
                detail=review.get("summary", "")[:300],
                metadata={"score": review.get("score"), "critical": len(review.get("issues", []))},
            )
        else:
            workflow_event(
                run.id,
                "review.completed",
                step_id=step.step_id,
                agent_kind="code_reviewer",
                agent_name=agent.name,
                message=f"Review passed — score {review.get('score')}/100.",
                metadata={"score": review.get("score")},
            )
        return {"review": review}

    async def _run_fix(
        self,
        session: AsyncSession,
        run: WorkflowRun,
        step: WorkflowStep,
        state: WorkflowState,
    ) -> dict[str, Any]:
        kind = step.agent_kind or "backend_engineer"
        registry = get_registry()
        agent = self._get_agent(registry, kind)
        project = await self._project(session, run)

        review = state.review_results[-1] if state.review_results else {}
        issues = [
            i
            for i in (review.get("issues") or [])
            if str(i.get("agent") or kind) == kind
            and str(i.get("severity", "")).lower() in {"critical", "high", "medium"}
        ]
        issue_summary = json.dumps(issues[:10], indent=2) if issues else "See docs/code_review.md."
        affected = "\n".join(f"- {f}" for f in (state.files_created + state.files_modified)[-40:])
        ctx = AgentRunContext(
            session=session,
            project=project,
            user_message=(
                f"The code review failed (score {review.get('score')}). Fix ONLY the issues "
                f"assigned to you:\n{issue_summary}\n"
                f"Files changed in this run:\n{affected or '(none recorded)'}"
            ),
            instructions=FIX_INSTRUCTIONS,
            workflow_run_id=run.id,
            activity=ActivityReporter(
                run_id=run.id,
                step_id=step.step_id,
                agent_kind=kind,
                agent_name=agent.name,
            ),
            write_dirs=state.write_dirs_for(kind),
            extra=self._agent_context(state, kind, review=review),
        )
        workflow_event(
            run.id,
            "agent.started",
            step_id=step.step_id,
            agent_kind=kind,
            agent_name=agent.name,
            message=f"{agent.name} is fixing review findings.",
        )
        before = self._snapshot(project.root_dir)
        result = await agent.run(ctx)
        if result.failed:
            raise OrchestrationError(f"{kind} failed the fix: {result.reply[:2000]}")

        after = self._snapshot(project.root_dir)
        created, modified, deleted = self._diff_files(before, after)
        self._record_files(state, created, modified, deleted, kind, run, step.step_id, step.name)

        structured = extract_structured(result.reply, ("summary",))
        ctx.activity.report(  # type: ignore[union-attr]
            "step", "completed", f"{agent.name} finished the fix."
        )
        return {"reply": result.reply[:8000], "structured": structured or {}}

    # --- deployment stages -------------------------------------------
    async def _run_deploy_step(
        self,
        session: AsyncSession,
        run: WorkflowRun,
        step: WorkflowStep,
    ) -> dict[str, Any]:
        """Execute one provider deployment stage, streaming honest logs."""
        ctx = run.context
        provider_name = str(ctx.get("provider") or "")
        environment = str(ctx.get("environment") or "staging")
        deployment_id = str(ctx.get("deployment_id") or "")
        provider = get_provider(provider_name)
        if provider is None:
            raise OrchestrationError(f"unknown deployment provider: {provider_name}")
        deployment = (
            await session.get(Deployment, deployment_id) if deployment_id else None
        )
        if deployment is None:
            raise OrchestrationError("deployment not found")
        project = await self._project(session, run)
        root = Path(project.root_dir)
        profile = profile_for(root)

        def log(message: str, level: str = "info", detail: str = "") -> None:
            deployment.logs = [
                *deployment.logs,
                {
                    "ts": datetime.now(UTC).isoformat(),
                    "level": level,
                    "message": message,
                    "detail": detail,
                },
            ]

        dctx = ProviderContext(
            project=project,
            root=root,
            environment=environment,
            deployment_id=deployment_id,
            extra={
                "provider": provider_name,
                "frontend_dir": profile.frontend_dir,
                "static_dir": profile.static_dir,
                "deployment_id": deployment_id,
            },
        )

        try:
            if step.step_id == "deploy_validate":
                return await self._deploy_validate(
                    session, provider, deployment, dctx, profile, log
                )
            if step.step_id == "deploy_build":
                await provider.build(dctx, log)
                log(f"{provider.label} build complete.", "info", "")
                await session.flush()
                return {"stage": "build", "status": "completed"}
            if step.step_id == "deploy_go":
                result = await provider.deploy(dctx, log)
                deployment.provider = provider_name
                deployment.deployment_url = result.deployment_url
                deployment.project_url = result.project_url or result.deployment_url
                deployment.deployment_id = result.deployment_id
                deployment.deployed_commit = short_commit(root)
                run.result = {**run.result, "deployment": result.__dict__}
                log("Deployment submitted — verifying it is live next.", "info", "")
                await session.flush()
                return {"stage": "deploy", "status": "completed", **result.__dict__}
            if step.step_id == "deploy_verify":
                prev = run.result.get("deployment") or {}
                result = ProviderDeployResult(
                    deployment_url=str(prev.get("deployment_url") or ""),
                    deployment_id=str(prev.get("deployment_id") or ""),
                    project_url=str(prev.get("project_url") or ""),
                    detail=str(prev.get("detail") or ""),
                )
                outcome = await provider.verify(dctx, log, result)
                if outcome.get("verified"):
                    deployment.status = DeploymentStatus.DEPLOYED.value
                    deployment.deployed_at = datetime.now(UTC)
                    log("Deployment verified live.", "info", "")
                    workflow_event(
                        run.id,
                        "deployment.ready",
                        step_id=step.step_id,
                        agent_kind="devops_engineer",
                        agent_name="DevOps Engineer",
                        message=f"Deployment is live — {deployment.deployment_url}.",
                        metadata={"url": deployment.deployment_url},
                    )
                else:
                    deployment.status = DeploymentStatus.FAILED.value
                    deployment.error = "deployment could not be verified as reachable"
                    log(
                        "Deployment could not be verified as reachable.",
                        "error",
                        outcome.get("message", ""),
                    )
                await session.flush()
                return {"stage": "verify", "status": "completed", **outcome}
            raise OrchestrationError(f"unknown deploy step: {step.step_id}")
        except DeploymentError as exc:
            deployment.status = DeploymentStatus.FAILED.value
            deployment.error = str(exc)[:2000]
            log(str(exc)[:2000], "error", "")
            workflow_event(
                run.id,
                "deployment.failed",
                step_id=step.step_id,
                agent_kind="devops_engineer",
                agent_name="DevOps Engineer",
                message=f"Deployment failed at {step.step_id}.",
                detail=str(exc)[:300],
            )
            await session.flush()
            raise OrchestrationError(f"{provider_name} deployment failed: {exc}") from exc

    async def _deploy_validate(
        self,
        session: AsyncSession,
        provider: Any,
        deployment: Deployment,
        dctx: ProviderContext,
        profile: Any,
        log,
    ) -> dict[str, Any]:
        from agency.services.deployment import DeploymentService

        if not provider.is_configured():
            missing = ", ".join(provider.config_status())
            raise DeploymentError(
                "Deployment provider is not configured. Set "
                f"{missing} in the backend environment and restart."
            )
        ok, reason = provider.compatible(profile)
        log(f"Target: {provider.label} · {reason}", "info", "")
        if not ok:
            raise DeploymentError(reason)

        # Don't ship broken code: gate on the code-quality checks before any
        # provider work. The docker/config/secret checks only apply to the
        # legacy compose flow, so they are not required here.
        checks = await DeploymentService.validate(session, dctx.project)
        gate = {c.name: c for c in checks if c.name in ("all_tasks_done", "lint", "tests")}
        deployment.checks = {name: c.model_dump() for name, c in gate.items()}
        failed = [name for name, c in gate.items() if not c.passed]
        for check in checks:
            if check.name in gate:
                log(f"{check.name}: {check.detail}", "info" if check.passed else "warn", "")
        if failed:
            raise DeploymentError(
                "pre-deploy checks failed — not deploying broken code: "
                + ", ".join(failed)
            )
        log("Code-quality gate passed — ready to build and ship.", "info", "")
        await session.flush()
        return {"stage": "validate", "status": "completed"}

    # --- state helpers --------------------------------------------------
    def _persist_state(self, session: AsyncSession, run: WorkflowRun, state: WorkflowState) -> None:
        run.context = {**run.context, "workflow_state": state.as_dict()}

    def _agent_context(
        self,
        state: WorkflowState,
        kind: str,
        *,
        review: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Compact context slice for one agent — never the full shared state.

        Each agent only sees the slice it needs (rule 11): the shared task, the
        architecture/plan/api contract it must conform to, the files already
        changed or inspected, and (for the fixer) the review it must address.
        """
        ctx: dict[str, Any] = {
            "task": state.project_request,
            "architecture": state.architecture,
            "plan": state.plan,
            "api_contract": state.api_contract,
            "changed_files": (state.files_created + state.files_modified)[-50:],
            "inspected_files": state.inspected_files[-50:],
        }
        if review is not None:
            ctx["review"] = review
        return ctx

    def _reviewer_spec(self, state: WorkflowState) -> str:
        """Compact architecture + API contract appendix for the reviewer."""
        parts = []
        if state.architecture:
            parts.append(
                "\nARCHITECTURE (verify compliance):\n"
                + json.dumps(state.architecture, indent=2)[:3000]
            )
        if state.api_contract:
            parts.append(
                "\nAPI CONTRACT (verify compliance):\n"
                + json.dumps(state.api_contract, indent=2)[:2500]
            )
        return "".join(parts)

    def _record_inspected(self, state: WorkflowState, actions: list[dict[str, Any]]) -> None:
        """Record the files an agent read so downstream agents don't re-read them."""
        if not actions:
            return
        seen = set(state.inspected_files)
        for action in actions:
            if action.get("tool") not in {"read_file", "list_dir"}:
                continue
            args = action.get("arguments") or {}
            path = args.get("path") or args.get("file_path") or args.get("directory")
            if isinstance(path, str) and path:
                norm = path.replace("\\", "/").lstrip("./")
                if norm and norm not in seen:
                    seen.add(norm)
        state.inspected_files = sorted(seen)[-200:]

    async def _absorb_architecture(
        self,
        session: AsyncSession,
        run: WorkflowRun,
        state: WorkflowState,
        reply: str,
        structured: dict[str, Any] | None,
        step: WorkflowStep,
    ) -> None:
        """Persist the Planner's architecture into state, disk and knowledge."""
        project = await self._project(session, run)
        plan_doc = Path(project.root_dir) / "docs" / "implementation_plan.md"
        try:
            plan_doc.parent.mkdir(parents=True, exist_ok=True)
            if not plan_doc.exists():
                plan_doc.write_text(reply, encoding="utf-8")
        except OSError:
            pass

        arch = (structured or {}).get("architecture")
        if isinstance(arch, dict):
            state.architecture = arch
            state.project_type = str(arch.get("project_type") or state.project_type)
            stack = arch.get("technology_stack")
            if isinstance(stack, dict):
                state.technology_stack = stack
            dirs = structured.get("directories")
            if isinstance(dirs, dict):
                state.architecture["directories"] = dirs
            structure = structured.get("project_structure")
            if isinstance(structure, dict):
                state.project_structure = structure
            plan = {"tasks": structured.get("tasks") or [], "dependencies": structured.get("dependencies") or []}
            api = structured.get("api_contract")
            if isinstance(api, dict):
                state.api_contract = api
                plan["api_contract"] = api
            for key in ("files_to_create", "files_to_modify"):
                value = structured.get(key)
                if isinstance(value, list):
                    plan[key] = value
            state.plan = plan

        self._write_architecture_json(project, state)
        try:
            kb = KnowledgeBase(project_root=Path(project.root_dir))
            await kb.index_text(
                session,
                title="architecture.json",
                source="docs/architecture.json",
                content=json.dumps(state.architecture, indent=2),
                project_id=project.id,
            )
        except Exception:
            pass
        try:
            registry = get_registry()
            if registry.memory:
                await registry.memory.write(
                    session,
                    agent_kind="planner",
                    content=json.dumps(state.architecture, indent=2)[:3000],
                    kind=MemoryKind.ARCHITECTURE.value,
                    scope_type="project",
                    scope_id=str(project.id),
                    importance=0.95,
                    summary=state.project_type or "Architecture design",
                )
        except Exception:
            pass
        await session.flush()

    def _write_architecture_json(self, project: Project, state: WorkflowState) -> None:
        root = Path(project.root_dir)
        try:
            docs = root / "docs"
            docs.mkdir(parents=True, exist_ok=True)
            (docs / "architecture.json").write_text(
                json.dumps(
                    {
                        "project_type": state.project_type,
                        "technology_stack": state.technology_stack,
                        "architecture": state.architecture,
                        "project_structure": state.project_structure,
                        "plan": state.plan,
                        "api_contract": state.api_contract,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        except OSError:
            pass

    async def _ensure_architecture_json(self, project: Project, state: WorkflowState) -> None:
        """Load a previously persisted architecture when the Planner didn't run."""
        if state.architecture:
            return
        arch_file = Path(project.root_dir) / "docs" / "architecture.json"
        try:
            if arch_file.exists():
                data = json.loads(arch_file.read_text(encoding="utf-8"))
                if isinstance(data.get("architecture"), dict):
                    state.architecture = data["architecture"]
                    state.project_type = str(data.get("project_type") or "")
                    if isinstance(data.get("technology_stack"), dict):
                        state.technology_stack = data["technology_stack"]
                    if isinstance(data.get("project_structure"), dict):
                        state.project_structure = data["project_structure"]
        except Exception:
            pass

    def _write_review_doc(self, project: Project, review: dict[str, Any]) -> None:
        root = Path(project.root_dir)
        try:
            docs = root / "docs"
            docs.mkdir(parents=True, exist_ok=True)
            (docs / "code_review.md").write_text(
                self._render_review_markdown(review), encoding="utf-8"
            )
        except OSError:
            pass

    def _render_review_markdown(self, review: dict[str, Any]) -> str:
        lines = [
            "# Code Review",
            "",
            f"- Status: {review.get('status', 'passed')}",
            f"- Score: {review.get('score', 0)} / 100",
            "",
            "## Findings",
        ]
        by_severity = {"critical": [], "high": [], "medium": [], "low": [], "suggestion": []}
        for issue in review.get("issues") or []:
            by_severity.setdefault(str(issue.get("severity", "low")).lower(), []).append(issue)
        for severity in ("critical", "high", "medium", "low", "suggestion"):
            for issue in by_severity[severity]:
                file = issue.get("file") or "?"
                line = issue.get("line") or 0
                lines.append(f"### [{severity.upper()}] {file}:{line}")
                lines.append(issue.get("title") or "Issue")
                if issue.get("why"):
                    lines.append(f"\nWhy: {issue['why']}")
                if issue.get("fix"):
                    lines.append(f"\nFix: {issue['fix']}")
                lines.append("")
        lines.append("\n## Summary\n")
        lines.append(str(review.get("summary") or ""))
        return "\n".join(lines)

    def _coerce_review(self, structured: dict[str, Any] | None, reply: str) -> dict[str, Any]:
        if structured:
            issues = []
            for raw in structured.get("issues") or []:
                if not isinstance(raw, dict):
                    continue
                issues.append(
                    {
                        "severity": str(raw.get("severity", "low")).lower(),
                        "file": str(raw.get("file") or ""),
                        "line": int(raw.get("line") or 0),
                        "title": str(raw.get("title") or "Untitled finding"),
                        "why": str(raw.get("why") or ""),
                        "fix": str(raw.get("fix") or ""),
                        "agent": str(raw.get("agent") or ""),
                    }
                )
            return {
                "status": "failed" if str(structured.get("status", "passed")).lower() == "failed" else "passed",
                "score": max(0, min(100, int(structured.get("score") or 0))),
                "issues": issues,
                "files_reviewed": [str(f) for f in (structured.get("files_reviewed") or []) if isinstance(f, str)],
                "required_fixes": [str(f) for f in (structured.get("required_fixes") or []) if isinstance(f, str)],
                "summary": str(structured.get("summary") or ""),
            }
        # No structured result (e.g. offline provider): treat as passed, unknown.
        return {
            "status": "passed",
            "score": 0,
            "issues": [],
            "files_reviewed": [],
            "required_fixes": [],
            "summary": reply[:400],
            "unstructured": True,
        }

    # --- file deltas ----------------------------------------------------
    def _snapshot(self, root: str) -> dict[str, tuple[int, int]]:
        out: dict[str, tuple[int, int]] = {}
        base = Path(root)
        if not base.exists():
            return out
        for p in base.rglob("*"):
            rel = p.relative_to(base)
            if any(part in SKIP_DIRS for part in rel.parts):
                continue
            if p.is_file():
                try:
                    st = p.stat()
                except OSError:
                    continue
                out[str(rel).replace("\\", "/")] = (st.st_size, st.st_mtime_ns)
        return out

    def _diff_files(
        self, before: dict[str, tuple[int, int]], after: dict[str, tuple[int, int]]
    ) -> tuple[list[str], list[str], list[str]]:
        created = [p for p in after if p not in before]
        deleted = [p for p in before if p not in after]
        modified = [p for p in before if p in after and before[p] != after[p]]
        return created, modified, deleted

    def _record_files(
        self,
        state: WorkflowState,
        created: list[str],
        modified: list[str],
        deleted: list[str],
        kind: str,
        run: WorkflowRun,
        step_id: str = "",
        agent_name: str = "",
    ) -> None:
        created = [f for f in created if not f.startswith("docs/")]
        for path in created:
            if path not in state.files_created:
                state.files_created.append(path)
        for path in modified:
            if path not in state.files_modified and path not in state.files_created:
                state.files_modified.append(path)
        for path in deleted:
            if path not in state.files_deleted:
                state.files_deleted.append(path)
        if created:
            workflow_event(
                run.id, "agent.file_created",
                step_id=step_id, agent_kind=kind, agent_name=agent_name,
                message=f"{kind} created {len(created)} file(s).",
                detail=", ".join(created[:8]),
            )
        if modified:
            workflow_event(
                run.id, "agent.file_modified",
                step_id=step_id, agent_kind=kind, agent_name=agent_name,
                message=f"{kind} modified {len(modified)} file(s).",
                detail=", ".join(modified[:8]),
            )

    # --- git / notifications --------------------------------------------
    async def _checkpoint(self, project: Project, state: WorkflowState, label: str) -> dict:
        if not get_settings().enable_git_checkpoints:
            return {"label": label, "created": False, "reason": "disabled"}
        root = Path(project.root_dir)
        message = "\n".join(
            f"- {agent}: {_short_text(str(v.get('summary') or v.get('status') or '') if isinstance(v, dict) else str(v), 160)}"
            for agent, v in state.agent_outputs.items()
        ) or "no agent output yet"
        result = git_checkpoint(
            root,
            label=label,
            message=message,
            name=get_settings().git_checkpoint_name,
            email=get_settings().git_checkpoint_email,
        )
        if result.get("created"):
            state.checkpoints.append(result)
        return result

    async def _notify_review_failed(self, session: AsyncSession, run: WorkflowRun, review: dict[str, Any]) -> None:
        try:
            from agency.api.routes.notifications import notify

            await notify(
                session,
                title="Code review failed after fixes",
                body=(
                    f"Workflow {run.id} reached the review retry limit. "
                    f"Score: {review.get('score')}/100. See docs/code_review.md."
                ),
                kind="warning",
            )
        except Exception:
            logger.warning("failed to record review_failed notification", exc_info=True)

    # --- summary --------------------------------------------------------
    def _build_summary(
        self, run: WorkflowRun, state: WorkflowState, steps: list[WorkflowStep]
    ) -> dict[str, Any]:
        review = state.review_results[-1] if state.review_results else None
        structure = sorted(
            {p.split("/")[0] for p in (state.files_created + state.files_modified)}
        )
        agents = []
        for step in steps:
            if step.agent_kind:
                agents.append(
                    {
                        "kind": step.agent_kind,
                        "name": step.name,
                        "status": step.status.lower(),
                    }
                )
        return {
            "project_request": state.project_request,
            "project_type": state.project_type or "—",
            "architecture": state.architecture,
            "agents": agents,
            "files": {
                "created": len(state.files_created),
                "modified": len(state.files_modified),
                "deleted": len(state.files_deleted),
            },
            "files_created": state.files_created[-25:],
            "files_modified": state.files_modified[-25:],
            "review": review,
            "checkpoints": state.checkpoints,
            "structure": structure,
        }

    # --- misc -----------------------------------------------------------
    def _instructions_for(self, run: WorkflowRun, kind: str, state: WorkflowState) -> str:
        base = _INSTRUCTIONS.get(kind, IMPLEMENT_INSTRUCTIONS)
        parts = [base]
        plan_source = run.context.get("plan_source", "agent")
        if plan_source == "upload":
            parts.append(_PLAN_SOURCE_MSG["upload"])
        platform = run.context.get("platform") or ""
        if kind == "devops_engineer" and platform:
            parts.append(f"Deployment target platform: {platform}.")
        if kind in {"backend_engineer", "frontend_engineer"}:
            arch = state.architecture
            if arch:
                parts.append(
                    "ARCHITECTURE (follow exactly):\n" + json.dumps(arch, indent=2)[:6000]
                )
        if kind in {"backend_engineer", "frontend_engineer", "devops_engineer"}:
            plan = state.plan or {}
            tasks = plan.get("tasks")
            if tasks:
                parts.append(
                    "IMPLEMENTATION PLAN (follow exactly):\n"
                    + json.dumps({"tasks": tasks[:8]}, indent=2)[:2500]
                )
            if state.api_contract:
                parts.append(
                    "API CONTRACT (implement to this spec):\n"
                    + json.dumps(state.api_contract, indent=2)[:3000]
                )
            if state.inspected_files:
                parts.append(
                    "FILES ALREADY INSPECTED (do not re-read these — reuse the results):\n"
                    + "\n".join(f"- {f}" for f in state.inspected_files[-40:])
                )
        return "\n\n".join(parts)

    def _get_agent(self, registry: AgentRegistry, kind: str) -> BaseAgent:
        agent = registry.get(kind)
        if agent is None:
            raise OrchestrationError(f"unknown agent kind: {kind}")
        return agent

    async def _project(self, session: AsyncSession, run: WorkflowRun) -> Project:
        if run.project_id is None:
            raise OrchestrationError("workflow has no project")
        project = await session.get(Project, run.project_id)
        if project is None:
            raise OrchestrationError("project not found")
        return project


workflow_orchestrator = WorkflowOrchestrator()
