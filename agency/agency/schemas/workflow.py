"""Workflow schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from agency.schemas.common import ORMModel


class WorkflowStartRequest(BaseModel):
    kind: str = Field(min_length=1, max_length=60)  # build_project | code_review | deploy
    context: dict = Field(default_factory=dict)


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


class WorkflowApproveRequest(BaseModel):
    decision: str = Field(default="approve")  # approve | reject
    comment: str = Field(default="", max_length=2000)
    actor: str = Field(default="human", max_length=100)
