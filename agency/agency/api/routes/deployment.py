"""Deployment endpoints: readiness checks, run, approval, execution, providers."""

from __future__ import annotations

import re
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from agency.api.deps import CurrentUser, DbSession
from agency.api.ownership import require_owned_deployment, require_owned_project
from agency.api.routes.agents import _spawn_background
from agency.api.routes.workflows import serialize_workflow_run
from agency.db.models import Deployment, Project
from agency.deployments import get_provider
from agency.schemas.deployment import (
    DeployLaunchOut,
    DeploymentApproveRequest,
    DeploymentLogOut,
    DeploymentOptionsOut,
    DeploymentOut,
    DeploymentRunRequest,
    DeploymentValidateOut,
    DeployRequest,
    DomainOut,
    DomainRequest,
)
from agency.services.deployment import (
    ProviderNotConfigured,
    deployment_service,
)
from agency.workflows.orchestrator import workflow_orchestrator

router = APIRouter(tags=["deployment"])

_DOMAIN_RE = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")


def _normalize_domain(domain: str) -> str:
    domain = (domain or "").strip().lower().rstrip(".")
    if not _DOMAIN_RE.fullmatch(domain):
        raise HTTPException(422, "invalid domain — expected e.g. app.example.com")
    return domain


async def _project_or_404(project_id: UUID, session: DbSession, user) -> Project:
    return await require_owned_project(session, project_id, user)


@router.get("/projects/{project_id}/deployments/validate", response_model=DeploymentValidateOut)
async def validate_deployment(
    project_id: UUID, session: DbSession, user: CurrentUser
) -> DeploymentValidateOut:
    project = await require_owned_project(session, project_id, user)
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
    project_id: UUID, payload: DeploymentRunRequest, session: DbSession, user: CurrentUser
) -> DeploymentOut:
    project = await require_owned_project(session, project_id, user)
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
async def list_deployments(
    project_id: UUID, session: DbSession, user: CurrentUser
) -> list[DeploymentOut]:
    await require_owned_project(session, project_id, user)
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
    deployment_id: UUID,
    payload: DeploymentApproveRequest,
    session: DbSession,
    user: CurrentUser,
) -> DeploymentOut:
    await require_owned_deployment(session, deployment_id, user)
    deployment = await deployment_service.approve(
        session,
        deployment_id,
        approve=payload.approve,
        actor=payload.actor,
        comment=payload.comment,
    )
    return DeploymentOut.model_validate(deployment)


@router.post("/deployments/{deployment_id}/execute", response_model=DeploymentOut)
async def execute_deployment(
    deployment_id: UUID, session: DbSession, user: CurrentUser
) -> DeploymentOut:
    await require_owned_deployment(session, deployment_id, user)
    try:
        deployment = await deployment_service.execute(session, deployment_id, actor="human")
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return DeploymentOut.model_validate(deployment)


# --- provider-based deployments (AWS / Vercel) -------------------------


@router.get("/projects/{project_id}/deploy/options", response_model=DeploymentOptionsOut)
async def deploy_options(
    project_id: UUID, session: DbSession, user: CurrentUser
) -> DeploymentOptionsOut:
    project = await _project_or_404(project_id, session, user)
    return DeploymentOptionsOut(**await deployment_service.options(session, project))


@router.post("/projects/{project_id}/deploy", response_model=DeployLaunchOut, status_code=201)
async def deploy_project(
    project_id: UUID, payload: DeployRequest, session: DbSession, user: CurrentUser
) -> DeployLaunchOut:
    project = await _project_or_404(project_id, session, user)
    provider = get_provider(payload.provider)
    if provider is None:
        raise HTTPException(422, f"unknown deployment provider: {payload.provider}")
    if not provider.is_configured():
        raise HTTPException(
            409, "Deployment provider is not configured."
        )
    options = await deployment_service.options(session, project)
    match = next(
        (p for p in options["providers"] if p["name"] == payload.provider), None
    )
    if match is None or not match.get("compatible"):
        reason = (match or {}).get("reason", "not compatible with this project")
        raise HTTPException(409, f"cannot deploy to {payload.provider}: {reason}")
    try:
        deployment, run = await deployment_service.launch(
            session, project, provider=payload.provider, environment=payload.environment
        )
    except ProviderNotConfigured as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    _spawn_background(workflow_orchestrator.execute_in_background(run.id))
    return DeployLaunchOut(
        deployment=DeploymentOut.model_validate(deployment),
        run=await serialize_workflow_run(session, run),
    )


@router.get("/projects/{project_id}/deployment", response_model=DeploymentOut | None)
async def latest_deployment(
    project_id: UUID, session: DbSession, user: CurrentUser
) -> DeploymentOut | None:
    project = await _project_or_404(project_id, session, user)
    deployment = await deployment_service.status(session, project.id)
    if deployment is None:
        return None
    return DeploymentOut.model_validate(deployment)


@router.get("/projects/{project_id}/deployment/logs", response_model=DeploymentLogOut)
async def deployment_logs(
    project_id: UUID, session: DbSession, user: CurrentUser
) -> DeploymentLogOut:
    project = await _project_or_404(project_id, session, user)
    return DeploymentLogOut(**await deployment_service.logs(session, project))


@router.post("/projects/{project_id}/redeploy", response_model=DeployLaunchOut, status_code=201)
async def redeploy_project(
    project_id: UUID, session: DbSession, user: CurrentUser
) -> DeployLaunchOut:
    project = await _project_or_404(project_id, session, user)
    try:
        deployment, run = await deployment_service.redeploy(session, project)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    _spawn_background(workflow_orchestrator.execute_in_background(run.id))
    return DeployLaunchOut(
        deployment=DeploymentOut.model_validate(deployment),
        run=await serialize_workflow_run(session, run),
    )


@router.delete("/projects/{project_id}/deployment", response_model=DeploymentOut)
async def remove_deployment(
    project_id: UUID, session: DbSession, user: CurrentUser
) -> DeploymentOut:
    project = await _project_or_404(project_id, session, user)
    try:
        deployment = await deployment_service.remove(session, project)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return DeploymentOut.model_validate(deployment)


@router.post("/projects/{project_id}/domain", response_model=DomainOut)
async def add_custom_domain(
    project_id: UUID, payload: DomainRequest, session: DbSession, user: CurrentUser
) -> DomainOut:
    project = await _project_or_404(project_id, session, user)
    domain = _normalize_domain(payload.domain)
    try:
        result = await deployment_service.add_domain(session, project, domain)
    except (ValueError, ProviderNotConfigured) as exc:
        status = 409 if isinstance(exc, ProviderNotConfigured) else 422
        raise HTTPException(status, str(exc)) from exc
    return DomainOut(**result)


@router.post("/projects/{project_id}/domain/verify", response_model=DomainOut)
async def verify_custom_domain(
    project_id: UUID, session: DbSession, user: CurrentUser
) -> DomainOut:
    project = await _project_or_404(project_id, session, user)
    try:
        result = await deployment_service.check_domain(session, project)
    except (ValueError, ProviderNotConfigured) as exc:
        status = 409 if isinstance(exc, ProviderNotConfigured) else 422
        raise HTTPException(status, str(exc)) from exc
    return DomainOut(**result)
