"""Live workflow activity feed.

An in-memory event bus that powers the dispatch "watch the crew work" view.
The workflow engine and agent loops append events as they run; the frontend
fast-polls ``GET /api/workflows/{id}/activity`` and renders a live transcript.

Events are intentionally high-level and safe: phase labels, tool names,
targets and status transitions. Raw model reasoning is never recorded.

Everything lives in-process, so a restart simply starts fresh — completed runs
fall back to a summary synthesized from their persisted steps in the route.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from datetime import UTC, datetime

MAX_EVENTS_PER_RUN = 500


@dataclass
class ActivityEvent:
    run_id: str
    step_id: str
    agent_kind: str
    agent_name: str
    kind: str  # run | step | phase | reasoning | tool | review
    status: str  # pending | running | completed | failed
    message: str
    tool: str = ""
    detail: str = ""
    metadata: dict = field(default_factory=dict)
    ts: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    seq: int = 0  # assigned by the store


class ActivityStore:
    def __init__(self) -> None:
        self._events: dict[str, list[ActivityEvent]] = {}
        self._seq = itertools.count(1)

    def add(self, run_id: object, event: ActivityEvent) -> ActivityEvent:
        event.seq = next(self._seq)
        key = str(run_id)
        bucket = self._events.setdefault(key, [])
        bucket.append(event)
        if len(bucket) > MAX_EVENTS_PER_RUN:
            del bucket[: len(bucket) - MAX_EVENTS_PER_RUN]
        return event

    def since(self, run_id: object, after: int = 0) -> list[ActivityEvent]:
        return [e for e in self._events.get(str(run_id), []) if e.seq > after]

    def clear(self, run_id: object) -> None:
        self._events.pop(str(run_id), None)


activity_store = ActivityStore()


def report_activity(
    run_id: object,
    *,
    kind: str,
    status: str,
    message: str,
    step_id: str = "",
    agent_kind: str = "",
    agent_name: str = "",
    tool: str = "",
    detail: str = "",
    metadata: dict | None = None,
) -> ActivityEvent:
    """Append a run-scoped event without an agent step (engine-level events)."""
    return activity_store.add(
        run_id,
        ActivityEvent(
            run_id=str(run_id),
            step_id=step_id,
            agent_kind=agent_kind,
            agent_name=agent_name,
            kind=kind,
            status=status,
            message=message,
            tool=tool,
            detail=detail,
            metadata=metadata or {},
        ),
    )


# Structured workflow event names → (kind, status). The event bus is the
# existing in-memory activity feed; these names give consumers a stable
# protocol on top of it.
WORKFLOW_EVENT_MAP: dict[str, tuple[str, str]] = {
    "workflow.started": ("run", "running"),
    "workflow.completed": ("run", "completed"),
    "workflow.failed": ("run", "failed"),
    "workflow.review_failed": ("run", "failed"),
    "workflow.checkpoint": ("phase", "completed"),
    "agent.started": ("step", "running"),
    "agent.thinking": ("reasoning", "running"),
    "agent.progress": ("phase", "running"),
    "agent.file_created": ("tool", "completed"),
    "agent.file_modified": ("tool", "completed"),
    "agent.completed": ("step", "completed"),
    "agent.failed": ("step", "failed"),
    "review.started": ("review", "running"),
    "review.completed": ("review", "completed"),
    "review.failed": ("review", "failed"),
    "review.retry_started": ("review", "running"),
}


def workflow_event(
    run_id: object,
    name: str,
    *,
    step_id: str = "",
    agent_kind: str = "",
    agent_name: str = "",
    message: str = "",
    tool: str = "",
    detail: str = "",
    metadata: dict | None = None,
) -> ActivityEvent:
    """Emit a structured workflow event mapped onto the activity feed."""
    kind, status = WORKFLOW_EVENT_MAP.get(name, ("phase", "running"))
    return report_activity(
        run_id,
        kind=kind,
        status=status,
        message=message,
        step_id=step_id,
        agent_kind=agent_kind,
        agent_name=agent_name,
        tool=tool,
        detail=detail,
        metadata={"event": name, **(metadata or {})},
    )


class ActivityReporter:
    """Binds one agent step to the global feed so its loop can emit phases."""

    def __init__(
        self,
        run_id: object,
        step_id: str,
        agent_kind: str,
        agent_name: str,
    ) -> None:
        self.run_id = str(run_id)
        self.step_id = step_id
        self.agent_kind = agent_kind
        self.agent_name = agent_name

    def report(
        self,
        kind: str,
        status: str,
        message: str,
        tool: str = "",
        detail: str = "",
        metadata: dict | None = None,
    ) -> None:
        activity_store.add(
            self.run_id,
            ActivityEvent(
                run_id=self.run_id,
                step_id=self.step_id,
                agent_kind=self.agent_kind,
                agent_name=self.agent_name,
                kind=kind,
                status=status,
                message=message,
                tool=tool,
                detail=detail,
                metadata=metadata or {},
            ),
        )


_TOOL_VERBS = {
    "read_file": "Reading file",
    "write_file": "Writing file",
    "list_dir": "Listing directory",
    "make_dir": "Creating directory",
    "delete_file": "Deleting file",
    "run_command": "Running command",
    "knowledge_search": "Searching knowledge base",
    "memory_read": "Reading memory",
    "memory_write": "Writing memory",
    "web_search": "Searching the web",
    "web_fetch": "Fetching page",
}

_TARGET_KEYS = ("path", "url", "query", "command", "slug")


def tool_verb(name: str) -> str:
    return _TOOL_VERBS.get(name, name.replace("_", " ").capitalize())


def tool_target(name: str, args: dict | None) -> str:
    """Extract a short human-readable target (path/query/command) for a tool."""
    if not args:
        return ""
    for key in _TARGET_KEYS:
        value = args.get(key)
        if isinstance(value, str) and value:
            return value
    return ""
