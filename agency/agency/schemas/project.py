"""Project and milestone schemas."""

from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import Field, field_validator

from agency.schemas.common import ORMModel


class ProjectCreate(ORMModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    slug: str | None = Field(default=None, max_length=220)

    @field_validator("slug")
    @classmethod
    def _slugify(cls, v: str | None) -> str | None:
        if v is None:
            return None
        slug = v.lower().strip().replace(" ", "-")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,100}", slug):
            raise ValueError(
                "slug may contain only lowercase letters, digits and hyphens "
                "(no '..', '/', '\\', ':' or spaces)"
            )
        return slug


class ProjectUpdate(ORMModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: str | None = None


class MilestoneIn(ORMModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    order_index: int = 0


class MilestoneOut(ORMModel):
    id: UUID
    project_id: UUID
    name: str
    description: str
    order_index: int
    status: str
    target_date: datetime | None
    created_at: datetime
    updated_at: datetime


class ProjectOut(ORMModel):
    id: UUID
    name: str
    slug: str
    description: str
    status: str
    root_dir: str
    workspace_mode: str = "structured"
    created_at: datetime
    updated_at: datetime


class ProjectDetailOut(ProjectOut):
    milestones: list[MilestoneOut] = []
    task_stats: dict[str, int] = Field(default_factory=dict)
    agent_stats: dict[str, str] = Field(default_factory=dict)


class PlanUploadOut(ORMModel):
    path: str
    project_id: UUID
    source: str
    size: int
