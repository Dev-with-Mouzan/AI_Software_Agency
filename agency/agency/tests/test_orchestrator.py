"""Orchestrator tests: dynamic execution order, shared state, review loop.

The offline (null) provider is scripted per-agent so the review loop can be
exercised deterministically: the reviewer fails once, the fixer runs, then the
re-review passes.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from agency.core.enums import WorkflowStatus
from agency.db.models import WorkflowStep
from agency.llm.provider import LLMResponse, NullProvider
from agency.workflows.orchestrator import workflow_orchestrator

pytestmark = pytest.mark.asyncio


def _all_text(messages: list[dict]) -> str:
    return " ".join(str(m.get("content") or "") for m in messages)


def _user_text(messages: list[dict]) -> str:
    return "".join(
        str(m.get("content") or "") for m in messages if m.get("role") == "user"
    )


class ScriptedFlowProvider(NullProvider):
    """Scripted NullProvider that records every prompt it serves, per agent kind."""

    def __init__(self, script: dict[str, list[LLMResponse]]):
        self._queue = {k: list(v) for k, v in script.items()}
        self.calls: dict[str, list[list[dict]]] = {k: [] for k in script}

    async def chat(self, messages, tools=None, *, temperature=None, max_tokens=None):
        kind = self._classify(messages)
        self.calls[kind].append(messages)
        queue = self._queue.get(kind)
        if not queue:
            raise RuntimeError(f"unexpected chat for {kind}")
        return queue.pop(0)

    def _classify(self, messages: list[dict]) -> str:
        system = next(
            (m.get("content") or "" for m in messages if m.get("role") == "system"),
            "",
        )
        s = str(system)
        if "Review the ACTUAL code" in s:
            return "code_reviewer"
        if "Generate deployment/infrastructure" in s:
            return "devops_engineer"
        if "design the ARCHITECTURE" in s:
            return "planner"
        if "Frontend Engineer" in s:
            return "frontend_engineer"
        return "backend_engineer"


async def _steps(db, run):
    return list(
        (
            await db.scalars(
                select(WorkflowStep)
                .where(WorkflowStep.workflow_run_id == run.id)
                .order_by(WorkflowStep.order_index)
            )
        ).all()
    )


async def test_orchestrator_builds_review_pipeline_order(db, project) -> None:
    """Planner → backend → frontend → review → devops ordering."""
    run = await workflow_orchestrator.prepare(
        db,
        project_id=project.id,
        agents=["planner", "backend_engineer", "frontend_engineer", "code_reviewer", "devops_engineer"],
        command="Build a SaaS portal",
    )
    steps = await _steps(db, run)
    assert [s.agent_kind for s in steps] == [
        "planner",
        "backend_engineer",
        "frontend_engineer",
        "code_reviewer",
        "devops_engineer",
    ]
    assert [s.handler for s in steps] == [
        "agent_run", "agent_run", "agent_run", "review_run", "agent_run",
    ]


async def test_orchestrator_devops_moves_after_review(db, project) -> None:
    run = await workflow_orchestrator.prepare(
        db,
        project_id=project.id,
        agents=["devops_engineer", "backend_engineer", "code_reviewer"],
        command="Build an API and deploy it",
    )
    steps = await _steps(db, run)
    assert [s.agent_kind for s in steps] == [
        "backend_engineer",
        "code_reviewer",
        "devops_engineer",
    ]


async def test_orchestrator_run_completes_and_shared_state_persisted(db, project) -> None:
    run = await workflow_orchestrator.prepare(
        db,
        project_id=project.id,
        agents=["planner", "backend_engineer"],
        command="Build a REST API",
    )
    run = await workflow_orchestrator.execute(db, run)
    assert run.status == WorkflowStatus.COMPLETED.value
    state = run.context.get("workflow_state") or {}
    assert state.get("workflow_status") == "completed"
    assert state.get("project_request") == "Build a REST API"
    assert run.result.get("summary"), "final summary should be generated"


async def test_orchestrator_review_loop_fixes_then_passes(db, project, monkeypatch) -> None:
    """Reviewer fails → fixer runs → re-review passes, workflow completes."""
    import json

    from agency.llm.provider import LLMResponse, NullProvider

    script = {
        "backend_engineer": [
            LLMResponse(text="Implemented the API.", tool_calls=[]),
            LLMResponse(
                text=json.dumps(
                    {"summary": "Fixed auth validation.", "fixed": ["apps/api/app.py"], "notes": []}
                ),
                tool_calls=[],
            ),
        ],
        "code_reviewer": [
            # First review fails with critical backend issue.
            LLMResponse(
                text=json.dumps(
                    {
                        "status": "failed",
                        "score": 45,
                        "issues": [
                            {
                                "severity": "critical",
                                "file": "apps/api/app.py",
                                "line": 12,
                                "title": "No auth validation",
                                "why": "Endpoint is publicly reachable",
                                "fix": "Add auth middleware",
                                "agent": "backend_engineer",
                            }
                        ],
                        "files_reviewed": ["apps/api/app.py"],
                        "required_fixes": ["backend_engineer"],
                        "summary": "Auth missing.",
                    }
                ),
                tool_calls=[],
            ),
            # Second review passes.
            LLMResponse(
                text=json.dumps(
                    {
                        "status": "passed",
                        "score": 92,
                        "issues": [],
                        "files_reviewed": ["apps/api/app.py"],
                        "required_fixes": [],
                        "summary": "All clear now.",
                    }
                ),
                tool_calls=[],
            ),
        ],
    }

    class ScriptedNull(NullProvider):
        def __init__(self):
            self._queue = {k: list(v) for k, v in script.items()}

        async def chat(self, messages, tools=None, *, temperature=None, max_tokens=None):
            kind = self._kind_from_instructions(messages)
            queue = self._queue.get(kind)
            if not queue:
                raise RuntimeError(f"unexpected chat for {kind}")
            return queue.pop(0)

        def _kind_from_instructions(self, messages):
            """Classify by the system-prompt role (deterministic)."""
            system = next(
                (m.get("content") or "" for m in messages if m.get("role") == "system"),
                "",
            )
            if "Code Reviewer" in str(system):
                return "code_reviewer"
            return "backend_engineer"

    monkeypatch.setattr("agency.llm.adapters.get_provider", lambda *a, **k: ScriptedNull())
    monkeypatch.setattr("agency.llm.adapters.get_agent_provider", lambda kind, **k: ScriptedNull())

    from agency.agents.registry import get_registry, reset_registry

    reset_registry()
    await get_registry().seed(db)

    run = await workflow_orchestrator.prepare(
        db,
        project_id=project.id,
        agents=["backend_engineer", "code_reviewer"],
        command="Build a REST API",
    )
    run = await workflow_orchestrator.execute(db, run)
    assert run.status == WorkflowStatus.COMPLETED.value
    steps = await _steps(db, run)
    kinds = [s.agent_kind for s in steps]
    assert "backend_engineer" in kinds
    assert len([s for s in steps if s.agent_kind == "code_reviewer"]) == 2, "re-review step should be scheduled"
    assert run.result.get("review", {}).get("status") == "passed"


async def test_orchestrator_review_fails_after_retries(db, project, monkeypatch) -> None:
    """Reviewer always fails → workflow ends REVIEW_FAILED."""
    import json

    from agency.llm.provider import LLMResponse

    class AlwaysFailReviewer:
        name = "scripted-fail"

        async def chat(self, messages, tools=None, *, temperature=None, max_tokens=None):
            return LLMResponse(
                text=json.dumps(
                    {
                        "status": "failed",
                        "score": 30,
                        "issues": [
                            {"severity": "critical", "file": "x.py", "line": 1, "title": "x", "why": "y", "fix": "z", "agent": "backend_engineer"}
                        ],
                        "files_reviewed": [],
                        "required_fixes": ["backend_engineer"],
                        "summary": "Still broken.",
                    }
                ),
                tool_calls=[],
            )

    monkeypatch.setattr("agency.llm.adapters.get_provider", lambda *a, **k: AlwaysFailReviewer())
    monkeypatch.setattr("agency.llm.adapters.get_agent_provider", lambda kind, **k: AlwaysFailReviewer())

    from agency.agents.registry import get_registry, reset_registry

    reset_registry()
    await get_registry().seed(db)

    run = await workflow_orchestrator.prepare(
        db,
        project_id=project.id,
        agents=["code_reviewer"],
        command="Review the project",
    )
    run = await workflow_orchestrator.execute(db, run)
    assert run.status == WorkflowStatus.REVIEW_FAILED.value
    assert run.result.get("review_failed") is True


async def test_runtime_flow_planner_backend_reviewer_loop(db, project, monkeypatch) -> None:
    """Full Planner→Backend→Reviewer(fail)→Fix→Re-review(pass) token-efficient flow.

    Asserts the runtime contract: the planner is deduped and runs exactly once;
    every agent receives a compact context slice (plan + API contract for the
    implementer, only changed files + spec for the reviewer, only its own issues
    for the fixer); full LLM replies never land in shared state.
    """
    import json

    planner_json = {
        "architecture": {
            "project_type": "web",
            "technology_stack": {"backend": "python", "frontend": "react"},
            "directories": {
                "backend": "apps/api",
                "frontend": "apps/web",
                "docs": "docs",
                "infra": "deployment",
                "tests": "tests",
            },
        },
        "tasks": [{"id": 1, "title": "Build the REST API", "owner": "backend_engineer"}],
        "api_contract": {
            "endpoints": [{"path": "/health", "method": "GET", "description": "Health check"}]
        },
        "files_to_create": ["apps/api/app.py"],
        "dependencies": [],
    }
    script = {
        "planner": [LLMResponse(text=json.dumps(planner_json), tool_calls=[])],
        "backend_engineer": [
            LLMResponse(text=json.dumps({"summary": "Implemented the REST API."}), tool_calls=[]),
            LLMResponse(
                text=json.dumps({"summary": "Fixed auth middleware.", "fixed": ["apps/api/app.py"]}),
                tool_calls=[],
            ),
        ],
        "code_reviewer": [
            LLMResponse(
                text=json.dumps(
                    {
                        "status": "failed",
                        "score": 45,
                        "issues": [
                            {
                                "severity": "critical",
                                "file": "apps/api/app.py",
                                "line": 12,
                                "title": "No auth validation",
                                "why": "Endpoint publicly reachable",
                                "fix": "Add auth middleware",
                                "agent": "backend_engineer",
                            }
                        ],
                        "files_reviewed": ["apps/api/app.py"],
                        "required_fixes": ["backend_engineer"],
                        "summary": "Auth missing.",
                    }
                ),
                tool_calls=[],
            ),
            LLMResponse(
                text=json.dumps(
                    {
                        "status": "passed",
                        "score": 92,
                        "issues": [],
                        "files_reviewed": ["apps/api/app.py"],
                        "required_fixes": [],
                        "summary": "All clear now.",
                    }
                ),
                tool_calls=[],
            ),
        ],
    }
    provider = ScriptedFlowProvider(script)
    monkeypatch.setattr("agency.llm.adapters.get_provider", lambda *a, **k: provider)
    monkeypatch.setattr("agency.llm.adapters.get_agent_provider", lambda kind, **k: provider)

    from agency.agents.registry import get_registry, reset_registry

    reset_registry()
    await get_registry().seed(db)

    run = await workflow_orchestrator.prepare(
        db,
        project_id=project.id,
        agents=["planner", "planner", "backend_engineer", "code_reviewer"],
        command="Build a REST API",
    )
    assert len([s for s in await _steps(db, run) if s.agent_kind == "planner"]) == 1
    run = await workflow_orchestrator.execute(db, run)

    assert run.status == WorkflowStatus.COMPLETED.value
    assert run.result.get("review", {}).get("status") == "passed"
    assert len([s for s in await _steps(db, run) if s.agent_kind == "code_reviewer"]) == 2
    assert len(provider.calls["planner"]) == 1, "planner ran exactly once"

    # Backend received the planner's plan + API contract, never a transcript.
    backend_first = _all_text(provider.calls["backend_engineer"][0])
    assert "ARCHITECTURE (follow exactly)" in backend_first
    assert "IMPLEMENTATION PLAN (follow exactly)" in backend_first
    assert "API CONTRACT (implement to this spec)" in backend_first
    assert _user_text(provider.calls["backend_engineer"][0]) == "Build a REST API"

    # Reviewer got only the compact slice: changed files + architecture + contract.
    review_user = _user_text(provider.calls["code_reviewer"][0])
    assert "Files changed this run" in review_user
    assert "ARCHITECTURE (verify compliance)" in review_user
    assert "API CONTRACT (verify compliance)" in review_user
    assert "Implemented the REST API" not in review_user, "full backend reply must not leak"

    # Fixer got only the issues assigned to it, not the whole transcript.
    fix_user = _user_text(provider.calls["backend_engineer"][1])
    assert "Fix ONLY the issues" in fix_user
    assert "No auth validation" in fix_user
    assert "Implemented the REST API" not in fix_user

    # Shared state stores compact results only (rule 12).
    state = run.context.get("workflow_state") or {}
    backend_out = state.get("agent_outputs", {}).get("backend_engineer", {})
    assert "reply" not in backend_out, "full reply must not be stored in shared state"
    assert backend_out.get("status") == "completed"
    assert state.get("api_contract", {}).get("endpoints", [{}])[0].get("path") == "/health"


async def test_runtime_flow_four_agents_devops_after_review(db, project, monkeypatch) -> None:
    """Backend → Frontend → Reviewer(pass) → DevOps, all outputs compact."""
    import json

    script = {
        "backend_engineer": [LLMResponse(text=json.dumps({"summary": "Backend done."}), tool_calls=[])],
        "frontend_engineer": [LLMResponse(text=json.dumps({"summary": "Frontend done."}), tool_calls=[])],
        "code_reviewer": [
            LLMResponse(
                text=json.dumps(
                    {
                        "status": "passed",
                        "score": 90,
                        "issues": [],
                        "files_reviewed": [],
                        "required_fixes": [],
                        "summary": "Solid.",
                    }
                ),
                tool_calls=[],
            )
        ],
        "devops_engineer": [LLMResponse(text=json.dumps({"summary": "Deploy config written."}), tool_calls=[])],
    }
    provider = ScriptedFlowProvider(script)
    monkeypatch.setattr("agency.llm.adapters.get_provider", lambda *a, **k: provider)
    monkeypatch.setattr("agency.llm.adapters.get_agent_provider", lambda kind, **k: provider)

    from agency.agents.registry import get_registry, reset_registry

    reset_registry()
    await get_registry().seed(db)

    run = await workflow_orchestrator.prepare(
        db,
        project_id=project.id,
        agents=["backend_engineer", "frontend_engineer", "devops_engineer", "code_reviewer"],
        command="Build the portal",
        platform="kubernetes",
    )
    steps = await _steps(db, run)
    assert [s.agent_kind for s in steps] == [
        "backend_engineer",
        "frontend_engineer",
        "code_reviewer",
        "devops_engineer",
    ]
    run = await workflow_orchestrator.execute(db, run)
    assert run.status == WorkflowStatus.COMPLETED.value
    assert run.result.get("review", {}).get("status") == "passed"

    # Reviewer passed on the first run (no fix loop) and ran before DevOps.
    assert len(provider.calls["code_reviewer"]) == 1
    assert len(provider.calls["backend_engineer"]) == 1

    # DevOps ran after review and received its platform target.
    devops_sys = _all_text(provider.calls["devops_engineer"][0])
    assert "Deployment target platform: kubernetes." in devops_sys

    # Every stored agent result is compact.
    state = run.context.get("workflow_state") or {}
    for kind in ("backend_engineer", "frontend_engineer", "devops_engineer"):
        out = state.get("agent_outputs", {}).get(kind, {})
        assert "reply" not in out, f"{kind} reply must not be stored"
        assert out.get("status") == "completed"
