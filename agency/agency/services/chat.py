"""Chat service: routes a human message to the most appropriate agent."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from agency.agents.base import AgentRunContext
from agency.agents.registry import get_registry
from agency.core.enums import MemoryKind
from agency.db.models import Project, Task
from agency.schemas.agent import ChatResponse

_ROUTING: list[tuple[str, list[str]]] = [
    (
        "code_reviewer",
        [
            "review",
            "audit",
            "vulnerability",
            "vulnerabilities",
            "security",
            "flaw",
            "loophole",
            "loopholes",
            "bug hunt",
            "code quality",
            "inspect",
            "look for problems",
            "risks",
        ],
    ),
    (
        "devops_engineer",
        [
            "deploy",
            "docker",
            "railway",
            "aws",
            "azure",
            "gcp",
            "vercel",
            "render",
            "fly.io",
            "flyio",
            "netlify",
            "kubernetes",
            "ci/cd",
            "infrastructure",
            "nginx",
            "hosting",
        ],
    ),
    (
        "backend_engineer",
        ["backend", "api", "database", "auth", "endpoint", "server", "sql", "redis", "fastapi"],
    ),
    (
        "frontend_engineer",
        [
            "frontend",
            "ui",
            "design",
            "theme",
            "animation",
            "3d",
            "react",
            "next.js",
            "nextjs",
            "component",
            "dashboard",
            "landing",
            "tailwind",
        ],
    ),
    (
        "planner",
        [
            "plan",
            "idea",
            "draft",
            "research",
            "roadmap",
            "tech stack",
            "brainstorm",
            "thinking",
            "concept",
            "architecture",
        ],
    ),
]

DEFAULT_AGENT = "planner"


def route_message(message: str) -> str:
    """Infer which agent should handle a message (most-specific keyword match wins)."""
    lowered = message.lower()
    best: str | None = None
    best_rank = -1
    for kind, keywords in _ROUTING:
        for idx, keyword in enumerate(keywords):
            if keyword in lowered and idx > best_rank:
                best_rank = idx
                best = kind
    return best or DEFAULT_AGENT


async def chat(
    session: AsyncSession,
    *,
    message: str,
    project_id: UUID | None = None,
    task_id: UUID | None = None,
    agent_kind: str | None = None,
) -> ChatResponse:
    registry = get_registry()
    kind = agent_kind or route_message(message)

    project = await session.get(Project, project_id) if project_id else None
    task = await session.get(Task, task_id) if task_id else None
    if task_id and task is None:
        raise ValueError("task not found")

    agent = registry.get(kind)
    if agent is None:
        raise ValueError(f"unknown agent kind: {kind}")

    ctx = AgentRunContext(
        session=session,
        project=project,
        task=task,
        user_message=message,
        instructions=f"Respond to the human (CEO/Engineering Manager). {'Use the assigned task context.' if task else ''}",
    )
    result = await agent.run(ctx)

    # Human conversation is also persisted to the agent's long-term memory.
    await registry.memory.write(
        session,
        agent_kind=kind,
        content=f"Human: {message[:1500]}",
        kind=MemoryKind.CONVERSATION.value,
        scope_type="conversation",
        scope_id=str(task.id) if task else "",
    )
    await session.commit()

    return ChatResponse(
        agent=agent.name,
        agent_kind=kind,
        reply=result.reply,
        actions=result.actions,
        needs_human=result.needs_human,
        task_id=task_id,
        created_at=datetime.now(UTC),
    )
