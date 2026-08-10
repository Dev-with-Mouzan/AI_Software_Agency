"""LangGraph adapter — deprecated.

Fixed pipelines were replaced by command-driven agent runs
(`workflows/engine.py::start_command_run`). LangGraph graph building has been
removed; this module remains import-safe for older integrations.
"""

from __future__ import annotations


def build_langgraph(kind: str = "command") -> None:
    """Raise — there are no fixed workflows to graph anymore."""
    raise NotImplementedError(
        "fixed workflows were removed; use POST /api/agents/run to execute "
        "an ordered list of agents against a project in the working area"
    )
