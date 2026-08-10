"""Agent, chat, memory and notification schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from agency.schemas.common import ORMModel


class AgentOut(ORMModel):
    id: UUID
    kind: str
    name: str
    title: str
    status: str
    role_description: str
    workspace: str
    allowed_tools: list[str]
    capabilities: list[str]
    heartbeat: datetime | None
    created_at: datetime
    updated_at: datetime
    llm_provider: str = ""
    llm_model: str = ""


class AgentRuntimeOut(BaseModel):
    kind: str
    name: str
    status: str
    current_task_id: UUID | None = None
    current_workflow_id: UUID | None = None
    last_activity: datetime | None = None
    short_term: list[dict] = Field(default_factory=list)
    stats: dict = Field(default_factory=dict)


class ChatRequest(BaseModel):
    project_id: UUID | None = None
    task_id: UUID | None = None
    message: str = Field(min_length=1, max_length=20000)


class AgentRunRequest(BaseModel):
    """Run an ordered list of agents against a project in the working area.

    plan_source: "agent" (default) — the Planner generates the plan first.
    "upload" — the human already uploaded docs/implementation_plan.md; the
    Planner must not run.
    """

    project_id: UUID | None = None
    agents: list[str] = Field(min_length=1, max_length=10)
    command: str = Field(min_length=1, max_length=20000)
    platform: str | None = Field(default=None, max_length=100)
    plan_source: str = Field(default="agent", max_length=20)


class ChatResponse(BaseModel):
    agent: str
    agent_kind: str
    reply: str
    actions: list[dict] = Field(default_factory=list)
    needs_human: bool = False
    task_id: UUID | None = None
    created_at: datetime


class AgentMemoryWrite(BaseModel):
    agent_kind: str
    kind: str = Field(default="conversation")
    scope_type: str = Field(default="")
    scope_id: str = Field(default="")
    content: str = Field(min_length=1, max_length=20000)
    importance: float = Field(default=0.5, ge=0.0, le=1.0)


class MemoryEntryOut(ORMModel):
    id: UUID
    agent_kind: str
    kind: str
    scope_type: str
    scope_id: str
    content: str
    summary: str
    importance: float
    created_at: datetime


class MemorySearchRequest(BaseModel):
    agent_kind: str | None = None
    query: str = Field(min_length=1, max_length=2000)
    k: int = Field(default=5, ge=1, le=50)


class MemorySearchResponse(BaseModel):
    query: str
    results: list[dict] = Field(default_factory=list)


class NotificationOut(ORMModel):
    id: UUID
    recipient: str
    kind: str
    title: str
    body: str
    read: bool
    created_at: datetime
