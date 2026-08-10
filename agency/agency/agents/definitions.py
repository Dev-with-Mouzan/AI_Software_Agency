"""Concrete agent implementations.

Each agent is thin: it inherits the shared agent loop and only declares its
identity `kind`. Role description and capabilities come from AGENT_PROFILES
keyed by kind (see `agency/agents/base.py::BaseAgent.__init_subclass__`).
Permission boundaries come from the permission policy keyed by `kind`.
Add new employees by adding a class here and registering it below.
"""

from __future__ import annotations

from agency.agents.base import BaseAgent


class PlannerAgent(BaseAgent):
    """Researches an idea on the web and produces a complete implementation plan."""

    kind = "planner"


class BackendEngineerAgent(BaseAgent):
    """Implements the backend from the implementation plan and chosen tech stack."""

    kind = "backend_engineer"


class FrontendEngineerAgent(BaseAgent):
    """Designs and builds a professional frontend from the implementation plan."""

    kind = "frontend_engineer"


class DevOpsEngineerAgent(BaseAgent):
    """Generates platform-specific deployment files and a deployment plan."""

    kind = "devops_engineer"


class CodeReviewerAgent(BaseAgent):
    """Audits the project in depth for flaws, loopholes and risks."""

    kind = "code_reviewer"


AGENT_CLASSES: dict[str, type[BaseAgent]] = {
    cls.kind: cls
    for cls in (
        PlannerAgent,
        BackendEngineerAgent,
        FrontendEngineerAgent,
        DevOpsEngineerAgent,
        CodeReviewerAgent,
    )
}
