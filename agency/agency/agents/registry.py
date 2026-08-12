"""Agent registry + runtime: manages registered employees and their lifecycle."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.agents.base import AgentResult, AgentRunContext, BaseAgent
from agency.agents.definitions import AGENT_CLASSES
from agency.agents.prompts import AGENT_PROFILES
from agency.core.enums import AgentStatus
from agency.db.models import AgentRecord
from agency.knowledge.index import KnowledgeBase
from agency.llm.adapters import get_agent_provider, get_provider
from agency.llm.provider import BaseLLMProvider, NullProvider
from agency.memory.manager import MemoryManager
from agency.tools.registry import get_tool_registry

logger = logging.getLogger(__name__)


def _safe_provider(builder: Any) -> tuple[BaseLLMProvider, str]:
    """Build a provider; never raise — fall back to NullProvider and record why."""
    try:
        return builder(), ""
    except Exception as exc:
        return NullProvider(), str(exc)


class AgentRegistry:
    """Holds live BaseAgent instances and their persistent records."""

    def __init__(
        self,
        llm: BaseLLMProvider | None = None,
        memory: MemoryManager | None = None,
        knowledge: KnowledgeBase | None = None,
    ) -> None:
        self.memory = memory or MemoryManager()
        self.knowledge = knowledge or KnowledgeBase()
        tools = get_tool_registry()
        self.llm = _safe_provider(lambda: llm or get_provider())[0]
        # Each agent can use its own LLM (e.g. DeepSeek for the three
        # implementation agents, default provider for the rest).
        self.agents: dict[str, BaseAgent] = {}
        self.config_errors: dict[str, str] = {}
        for kind, cls in AGENT_CLASSES.items():
            provider, error = _safe_provider(
                lambda kind=kind: get_agent_provider(kind)
            )
            if error:
                self.config_errors[kind] = error
                logger.warning("agent '%s' has no usable LLM: %s", kind, error)
            self.agents[kind] = cls(provider, self.memory, self.knowledge, tools)

    def get(self, kind: str) -> BaseAgent | None:
        return self.agents.get(kind)

    async def seed(self, session: AsyncSession) -> None:
        """Insert AgentRecord rows for every registered agent (idempotent).

        Also removes records for agents that no longer exist (e.g. after a roster
        change) so stale employees disappear from the UI and status queries.
        """
        live_kinds = set(self.agents)
        stale = list(
            (
                await session.scalars(
                    select(AgentRecord).where(AgentRecord.kind.not_in(list(live_kinds)))
                )
            ).all()
        )
        for record in stale:
            await session.delete(record)

        for kind, agent in self.agents.items():
            existing = await session.scalar(select(AgentRecord).where(AgentRecord.kind == kind))
            profile = AGENT_PROFILES[kind]
            from agency.core.enums import WORKSPACE_MAP

            if existing is None:
                session.add(
                    AgentRecord(
                        kind=kind,
                        name=agent.name,
                        title=agent.title,
                        status=AgentStatus.IDLE.value,
                        role_description=profile["description"],
                        workspace=WORKSPACE_MAP.get(kind, ""),
                        allowed_tools=agent.allowed_tool_names,
                        capabilities=agent.capabilities,
                    )
                )
            else:
                existing.name = agent.name
                existing.title = agent.title
                existing.role_description = profile["description"]
                existing.workspace = WORKSPACE_MAP.get(kind, "")
                existing.allowed_tools = agent.allowed_tool_names
                existing.capabilities = agent.capabilities
        await session.commit()

    async def status(self, session: AsyncSession) -> list[dict[str, Any]]:
        records = list(
            (await session.scalars(select(AgentRecord).order_by(AgentRecord.created_at))).all()
        )
        out = []
        for record in records:
            agent = self.get(record.kind)
            provider, model = "", ""
            from agency.services import settings as settings_service

            provider, model = settings_service.effective_agent_route(record.kind)
            out.append(
                {
                    "kind": record.kind,
                    "name": record.name,
                    "title": record.title,
                    "status": record.status,
                    "workspace": record.workspace,
                    "allowed_tools": record.allowed_tools,
                    "capabilities": record.capabilities,
                    "heartbeat": record.heartbeat.isoformat() if record.heartbeat else None,
                    "short_term": self.memory.short_term(record.kind, 5) if self.memory else [],
                    "description": record.role_description,
                    "tools_available": len(agent.allowed_tool_names) if agent else 0,
                    "llm": f"{provider} / {model or 'default'}" if provider else "",
                    "llm_error": self.config_errors.get(record.kind, ""),
                }
            )
        return out

    async def run(
        self, session: AsyncSession, ctx: AgentRunContext, agent_kind: str
    ) -> AgentResult:
        agent = self.get(agent_kind)
        if agent is None:
            raise ValueError(f"unknown agent kind: {agent_kind}")
        error = self.config_errors.get(agent_kind)
        if error:
            # Never silently degrade to the offline provider: a misconfigured
            # LLM must fail the run loudly so the human knows nothing was built.
            logger.warning("agent '%s' cannot run: %s", agent_kind, error)
            result = AgentResult()
            result.reply = (
                f"{agent.name} cannot run because the LLM provider is not configured: "
                f"{error}. Open Settings to connect an API key, or set it in the "
                ".env file, then restart the API."
            )
            result.needs_human = True
            result.failed = True
            result.stats = {"agent": agent_kind, "error": error}
            return result
        return await agent.run(ctx)


_registry: AgentRegistry | None = None


def get_registry() -> AgentRegistry:
    global _registry
    if _registry is None:
        _registry = AgentRegistry()
    return _registry


def reset_registry() -> None:
    global _registry
    _registry = None
