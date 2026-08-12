"""Workflow schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from agency.schemas.common import ORMModel


class WorkflowStepOut(ORMModel):
    id: UUID
    workflow_run_id: UUID
    step_id: str
    name: str
    order_index: int
    status: str
    agent_kind: str | None
    detail: str
    output: dict
    started_at: datetime | None
    completed_at: datetime | None


class WorkflowRunOut(ORMModel):
    id: UUID
    project_id: UUID | None
    kind: str
    status: str
    current_step: str
    context: dict
    result: dict
    started_at: datetime | None
    finished_at: datetime | None
    steps: list[WorkflowStepOut] = Field(default_factory=list)


class WorkflowActivityOut(ORMModel):
    seq: int
    run_id: str
    step_id: str
    agent_kind: str
    agent_name: str
    kind: str
    status: str
    message: str
    tool: str = ""
    detail: str = ""
    metadata: dict = Field(default_factory=dict)
    ts: str


class WorkflowActivityPage(ORMModel):
    run_id: str
    status: str
    done: bool
    activities: list[WorkflowActivityOut] = Field(default_factory=list)




class WorkflowApproveRequest(BaseModel):
    decision: str = Field(default="approve")  # approve | reject
    comment: str = Field(default="", max_length=2000)
    actor: str = Field(default="human", max_length=100)
