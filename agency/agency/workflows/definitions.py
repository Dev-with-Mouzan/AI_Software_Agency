"""Workflow model.

There are no fixed pipelines anymore. Runs are built dynamically from the
agents the human chooses for a project in the working area (see
`workflows/engine.py::start_command_run` and the `POST /agents/run` endpoint).
"""

from __future__ import annotations

# Agents a human can include in a command run, in any order.
SUPPORTED_AGENT_KINDS: list[str] = [
    "planner",
    "backend_engineer",
    "frontend_engineer",
    "devops_engineer",
]


def get_workflow(kind: str) -> None:
    """Raise for every kind — fixed workflows have been removed."""
    raise ValueError(
        f"fixed workflow '{kind}' no longer exists; run agents via POST /api/agents/run instead"
    )
