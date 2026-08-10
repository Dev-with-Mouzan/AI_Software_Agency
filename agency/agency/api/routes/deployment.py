"""Deployment endpoints: readiness checks, run, approval, execution."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from agency.api.deps import DbSession
from agency.db.models import Deployment
from agency.schemas.deployment import (
    DeploymentApproveRequest,
    DeploymentOut,
    DeploymentRunRequest,
    DeploymentValidateOut,
)
from agency.services.deployment import deployment_service
from agency.services.projects import project_service

router = APIRouter(tags=["deployment"])


@router.get("/projects/{project_id}/deployments/validate", response_model=DeploymentValidateOut)
async def validate_deployment(project_id: UUID, session: DbSession) -> DeploymentValidateOut:
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    checks = await deployment_service.validate(session, project)
    check_map = {c.name: c for c in checks}
    return DeploymentValidateOut(
        ready=all(c.passed for c in checks),
        environment="staging",
        version="0.0.0",
        checks=list(checks),
        all_tasks_complete=check_map["all_tasks_complete"].passed,
        tests_passing=check_map["tests"].passed,
        docker_build=check_map["docker_build"].passed,
        lint_passing=check_map["lint"].passed,
        secrets_validated=check_map["secrets_validated"].passed,
        config_validated=check_map["config_validated"].passed,
        human_approved=False,
    )


@router.post("/projects/{project_id}/deployments", response_model=DeploymentOut, status_code=201)
async def run_deployment(
    project_id: UUID, payload: DeploymentRunRequest, session: DbSession
) -> DeploymentOut:
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    deployment = await deployment_service.run(
        session,
        project,
        environment=payload.environment,
        version=payload.version,
        actor="human",
        skip_checks=payload.skip_checks,
    )
    return DeploymentOut.model_validate(deployment)


@router.get("/projects/{project_id}/deployments", response_model=list[DeploymentOut])
async def list_deployments(project_id: UUID, session: DbSession) -> list[DeploymentOut]:
    rows = list(
        (
            await session.scalars(
                select(Deployment)
                .where(Deployment.project_id == project_id)
                .order_by(Deployment.created_at.desc())
            )
        ).all()
    )
    return [DeploymentOut.model_validate(r) for r in rows]


@router.post("/deployments/{deployment_id}/approve", response_model=DeploymentOut)
async def approve_deployment(
    deployment_id: UUID, payload: DeploymentApproveRequest, session: DbSession
) -> DeploymentOut:
    deployment = await deployment_service.approve(
        session,
        deployment_id,
        approve=payload.approve,
        actor=payload.actor,
        comment=payload.comment,
    )
    return DeploymentOut.model_validate(deployment)


@router.post("/deployments/{deployment_id}/execute", response_model=DeploymentOut)
async def execute_deployment(deployment_id: UUID, session: DbSession) -> DeploymentOut:
    try:
        deployment = await deployment_service.execute(session, deployment_id, actor="human")
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return DeploymentOut.model_validate(deployment)
