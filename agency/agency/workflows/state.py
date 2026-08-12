"""Shared workflow state.

The orchestrator owns a single `WorkflowState` per run. Every agent reads the
relevant slices of it and returns structured output; the orchestrator merges
that output back into the state between steps. State is persisted on the run
row (``context["workflow_state"]``) so runs survive restarts, and the final
shape is exposed to the frontend through ``result``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class WorkflowState:
    project_request: str = ""
    project_type: str = ""
    technology_stack: dict[str, Any] = field(default_factory=dict)
    architecture: dict[str, Any] = field(default_factory=dict)
    project_structure: dict[str, Any] = field(default_factory=dict)
    plan: dict[str, Any] = field(default_factory=dict)
    api_contract: dict[str, Any] = field(default_factory=dict)
    files_created: list[str] = field(default_factory=list)
    files_modified: list[str] = field(default_factory=list)
    files_deleted: list[str] = field(default_factory=list)
    inspected_files: list[str] = field(default_factory=list)
    agent_outputs: dict[str, Any] = field(default_factory=dict)
    review_results: list[dict[str, Any]] = field(default_factory=list)
    review_attempts: int = 0
    review_retries_left: int = 0
    errors: list[str] = field(default_factory=list)
    checkpoints: list[dict[str, Any]] = field(default_factory=list)
    workflow_status: str = "running"

    def as_dict(self) -> dict[str, Any]:
        return {
            "project_request": self.project_request,
            "project_type": self.project_type,
            "technology_stack": self.technology_stack,
            "architecture": self.architecture,
            "project_structure": self.project_structure,
            "plan": self.plan,
            "api_contract": self.api_contract,
            "files_created": self.files_created,
            "files_modified": self.files_modified,
            "files_deleted": self.files_deleted,
            "inspected_files": self.inspected_files,
            "agent_outputs": self.agent_outputs,
            "review_results": self.review_results,
            "review_attempts": self.review_attempts,
            "review_retries_left": self.review_retries_left,
            "errors": self.errors,
            "checkpoints": self.checkpoints,
            "workflow_status": self.workflow_status,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> WorkflowState:
        data = data or {}
        return cls(
            project_request=str(data.get("project_request") or ""),
            project_type=str(data.get("project_type") or ""),
            technology_stack=dict(data.get("technology_stack") or {}),
            architecture=dict(data.get("architecture") or {}),
            project_structure=dict(data.get("project_structure") or {}),
            plan=dict(data.get("plan") or {}),
            api_contract=dict(data.get("api_contract") or {}),
            files_created=list(data.get("files_created") or []),
            files_modified=list(data.get("files_modified") or []),
            files_deleted=list(data.get("files_deleted") or []),
            inspected_files=list(data.get("inspected_files") or []),
            agent_outputs=dict(data.get("agent_outputs") or {}),
            review_results=list(data.get("review_results") or []),
            review_attempts=int(data.get("review_attempts") or 0),
            review_retries_left=int(data.get("review_retries_left") or 0),
            errors=list(data.get("errors") or []),
            checkpoints=list(data.get("checkpoints") or []),
            workflow_status=str(data.get("workflow_status") or "running"),
        )

    # --- convenience ------------------------------------------------
    def write_dirs_for(self, agent_kind: str) -> list[str] | None:
        """Map an agent to the write directories its planner architecture allows.

        Falls back to the static policy (backend/, frontend/, ...) when the
        Planner has not produced an architecture yet, so nothing breaks before
        the Planner runs.
        """
        arch = self.architecture.get("directories") or {}
        backend = arch.get("backend")
        frontend = arch.get("frontend")
        infra = arch.get("infra") or "deployment"
        docs = arch.get("docs") or "docs"
        tests = arch.get("tests") or "tests"
        shared = arch.get("shared") or "packages/shared"

        if agent_kind == "backend_engineer":
            dirs = [backend] if backend else ["backend"]
            if shared:
                dirs.append(shared)
            if tests and tests not in dirs:
                dirs.append(tests)
            return dirs
        if agent_kind == "frontend_engineer":
            dirs = [frontend] if frontend else ["frontend"]
            # The design directive tells the frontend agent to write its design
            # plan to docs/design.md, so docs/ is part of its write scope too.
            if docs and docs not in dirs:
                dirs.append(docs)
            if shared:
                dirs.append(shared)
            return dirs
        if agent_kind == "devops_engineer":
            dirs = [infra]
            if "docker" in arch:
                dirs.append(str(arch["docker"]))
            return dirs
        if agent_kind in {"planner", "code_reviewer"}:
            return [docs]
        return None
