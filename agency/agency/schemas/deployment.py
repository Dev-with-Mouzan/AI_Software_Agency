"""Deployment schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from agency.schemas.common import ORMModel


class DeploymentRunRequest(BaseModel):
    environment: str = Field(default="staging", max_length=30)
    version: str = Field(default="0.0.0", max_length=100)
    skip_checks: bool = False


class DeploymentCheckResult(BaseModel):
    name: str
    passed: bool
    detail: str = ""
    checked_at: datetime | None = None


class DeploymentValidateOut(BaseModel):
    ready: bool
    environment: str
    version: str
    checks: list[DeploymentCheckResult]
    all_tasks_complete: bool
    tests_passing: bool
    docker_build: bool
    lint_passing: bool
    secrets_validated: bool
    config_validated: bool
    human_approved: bool


class DeploymentApproveRequest(BaseModel):
    approve: bool = True
    actor: str = Field(default="human", max_length=100)
    comment: str = Field(default="", max_length=2000)


class DeploymentOut(ORMModel):
    id: UUID
    project_id: UUID
    environment: str
    status: str
    version: str
    checks: dict
    approved: bool
    approved_by: str
    approved_at: datetime | None
    deployed_at: datetime | None
    error: str
    created_at: datetime
    updated_at: datetime
