"""Deployment schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from agency.schemas.common import ORMModel
from agency.schemas.workflow import WorkflowRunOut


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

    # Provider-based fields (AWS / Vercel).
    provider: str = ""
    deployment_url: str = ""
    project_url: str = ""
    deployment_id: str = ""
    custom_domain: str = ""
    domain_status: str = "none"
    dns_records: dict = Field(default_factory=dict)
    deployed_commit: str = ""
    run_id: str = ""
    logs: list = Field(default_factory=list)
    removed: bool = False


class DeploymentProviderOption(BaseModel):
    name: str
    label: str
    configured: bool
    missing: list[str] = Field(default_factory=list)
    compatible: bool
    reason: str
    project_type: str = ""
    technology_stack: dict[str, Any] = Field(default_factory=dict)


class DeploymentOptionsOut(BaseModel):
    project_type: str = ""
    technology_stack: dict[str, Any] = Field(default_factory=dict)
    providers: list[DeploymentProviderOption] = Field(default_factory=list)


class DeployRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=40)
    environment: str = Field(default="production", max_length=30)


class DeployLaunchOut(BaseModel):
    deployment: DeploymentOut
    run: WorkflowRunOut


class DeploymentLogItem(BaseModel):
    ts: str = ""
    level: str = "info"
    message: str = ""
    detail: str = ""


class DeploymentLogOut(BaseModel):
    deployment_id: str | None = None
    status: str = ""
    logs: list[DeploymentLogItem] = Field(default_factory=list)


class DomainRequest(BaseModel):
    domain: str = Field(min_length=3, max_length=300)


class DomainOut(BaseModel):
    domain: str
    status: str
    dns_records: dict = Field(default_factory=dict)
    message: str = ""
    verified: bool = False
    ssl: str = "pending"
