"""Tool framework: declarative tools bound to a permission-checked context."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from agency.knowledge.index import KnowledgeBase
from agency.memory.manager import MemoryManager
from agency.permissions.policy import PermissionPolicy


@dataclass
class ToolResult:
    success: bool
    output: str = ""
    error: str = ""
    data: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "output": self.output,
            "error": self.error,
            "data": self.data,
        }


@dataclass
class ToolContext:
    """Everything a tool needs to act on behalf of an agent."""

    agent_kind: str
    agent_name: str
    project_root: Path | None  # absolute path of the current project workspace
    project_id: UUID | None = None
    task_id: str | None = None
    session: AsyncSession | None = None
    memory: MemoryManager | None = None
    knowledge: KnowledgeBase | None = None
    policy: PermissionPolicy = field(default_factory=PermissionPolicy)
    workspace_root: Path | None = None  # repository root for repo-level tools


class Tool(ABC):
    """Base class for all agent tools."""

    name: str = ""
    description: str = ""
    parameters: dict[str, Any] = {}

    @abstractmethod
    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        """Execute the tool. `ctx` carries identity + permission context."""

    def schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }
