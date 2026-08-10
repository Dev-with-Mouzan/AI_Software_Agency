"""Task and comment schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from agency.schemas.common import ORMModel


class TaskCreate(ORMModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default="", max_length=20000)
    priority: str = Field(default="MEDIUM")
    milestone_id: UUID | None = None
    owner: str | None = None  # agent kind
    dependencies: list[str] = Field(default_factory=list)
    files_affected: list[str] = Field(default_factory=list)
    estimated_points: int = Field(default=1, ge=1, le=100)


class TaskUpdate(ORMModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    milestone_id: UUID | None = None
    owner: str | None = None
    dependencies: list[str] | None = None
    files_affected: list[str] | None = None
    review_status: str | None = None
    estimated_points: int | None = Field(default=None, ge=1, le=100)


class TaskCommentIn(ORMModel):
    body: str = Field(min_length=1, max_length=10000)
    author: str = Field(default="human", max_length=100)


class TaskCommentOut(ORMModel):
    id: UUID
    task_id: UUID
    author: str
    body: str
    created_at: datetime


class TaskOut(ORMModel):
    id: UUID
    project_id: UUID
    milestone_id: UUID | None
    title: str
    description: str
    priority: str
    status: str
    owner: str | None
    dependencies: list[str]
    files_affected: list[str]
    review_status: str
    estimated_points: int
    created_at: datetime
    updated_at: datetime
    comments: list[TaskCommentOut] = Field(default_factory=list)


class TaskBoardRow(TaskOut):
    blocked_by: list[str] = Field(default_factory=list)
