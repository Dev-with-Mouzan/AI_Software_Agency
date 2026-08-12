"""Deployment gate: validates readiness, requires human approval, executes deploy.

Only the DevOps Engineer may declare a deployment ready; the human (CEO) must
approve before anything is actually released. This module implements both the
readiness checks and the deployment record lifecycle.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.config import get_settings
from agency.core.enums import DeploymentStatus, TaskStatus
from agency.db.models import Deployment, Project, Task
from agency.deployments import DeploymentError, ProviderContext, get_provider, profile_for
from agency.permissions.audit import record as audit_record
from agency.schemas.deployment import DeploymentCheckResult

REQUIRED_SECRET_KEYS = ["DATABASE_URL", "REDIS_URL"]
CHECK_TIMEOUT = 120


class ProviderNotConfigured(ValueError):
    """Raised when a deployment is requested but no provider credentials exist."""


class DeploymentService:
    @staticmethod
    async def validate(
        session: AsyncSession,
        project: Project,
        *,
        environment: str = "staging",
        version: str = "0.0.0",
    ) -> list[DeploymentCheckResult]:
        root = Path(project.root_dir)
        checks = [
            await _check_all_tasks_done(session, project.id),
            await _check_lint(root),
            await _check_tests(root),
            await _check_docker_compose(root),
            await _check_config(root),
            _check_secrets(environment),
        ]
        return checks

    @staticmethod
    async def run(
        session: AsyncSession,
        project: Project,
        *,
        environment: str = "staging",
        version: str = "0.0.0",
        actor: str = "devops_engineer",
        skip_checks: bool = False,
    ) -> Deployment:
        checks = (
            []
            if skip_checks
            else await DeploymentService.validate(
                session, project, environment=environment, version=version
            )
        )
        passed = all(c.passed for c in checks)
        deployment = Deployment(
            project_id=project.id,
            environment=environment,
            version=version,
            checks={c.name: _json_safe(c.model_dump()) for c in checks},
            status=(
                DeploymentStatus.READY_FOR_APPROVAL.value
                if passed
                else DeploymentStatus.CHECKS_PENDING.value
            ),
        )
        session.add(deployment)
        await session.flush()

        await audit_record(
            session,
            actor=actor,
            action="create",
            resource_type="deployment",
            resource_id=str(deployment.id),
            detail={"ready": passed, "environment": environment, "version": version},
        )
        await session.commit()
        return deployment

    @staticmethod
    async def approve(
        session: AsyncSession,
        deployment_id: UUID,
        *,
        approve: bool,
        actor: str = "human",
        comment: str = "",
    ) -> Deployment:
        deployment = await session.get(Deployment, deployment_id)
        if deployment is None:
            raise ValueError("deployment not found")
        if not approve:
            deployment.status = DeploymentStatus.REJECTED.value
            deployment.error = comment
        else:
            deployment.approved = True
            deployment.approved_by = actor
            deployment.approved_at = datetime.now(UTC)
            deployment.status = DeploymentStatus.APPROVED.value
        await audit_record(
            session,
            actor=actor,
            action="approve" if approve else "reject",
            resource_type="deployment",
            resource_id=str(deployment_id),
            detail={"comment": comment},
        )
        await session.flush()
        await session.commit()
        return deployment

    @staticmethod
    async def execute(
        session: AsyncSession, deployment_id: UUID, *, actor: str = "devops_engineer"
    ) -> Deployment:
        """Final release step. Guards: approved + all checks passed."""
        deployment = await session.get(Deployment, deployment_id)
        if deployment is None:
            raise ValueError("deployment not found")
        project = await session.get(Project, deployment.project_id)

        if not deployment.approved:
            raise ValueError("deployment has not been approved by the human")
        check_values = [c.get("passed", False) for c in deployment.checks.values()]
        if check_values and not all(check_values):
            raise ValueError("not all readiness checks passed")

        deployment.status = DeploymentStatus.DEPLOYING.value
        await session.flush()

        root = Path(project.root_dir) if project else None
        try:
            if root is not None:
                # Validate compose config; then build+start in detached mode.
                compose = _sh_quote(str(root / "docker-compose.yml"))
                await _run_shell(
                    f"docker compose -f {compose} config -q", root, timeout=60
                )
                await _run_shell(
                    f"docker compose -f {compose} up -d --build",
                    root,
                    timeout=CHECK_TIMEOUT,
                )
            deployment.status = DeploymentStatus.DEPLOYED.value
            deployment.deployed_at = datetime.now(UTC)
        except RuntimeError as exc:
            deployment.status = DeploymentStatus.FAILED.value
            deployment.error = str(exc)[:2000]

        await audit_record(
            session,
            actor=actor,
            action="update",
            resource_type="deployment",
            resource_id=str(deployment_id),
            detail={"status": deployment.status},
        )
        await session.commit()
        return deployment

    @staticmethod
    async def status(session: AsyncSession, project_id: UUID) -> Deployment | None:
        return (
            await session.scalars(
                select(Deployment)
                .where(Deployment.project_id == project_id)
                .order_by(Deployment.created_at.desc())
                .limit(1)
            )
        ).first()

    # --- provider deployments (AWS / Vercel) ----------------------------
    @staticmethod
    async def options(session: AsyncSession, project: Project) -> dict[str, Any]:
        from agency.deployments import provider_options

        profile = profile_for(Path(project.root_dir))
        return {
            "project_type": profile.description,
            "technology_stack": profile.tech_stack,
            "providers": provider_options(profile),
        }

    @staticmethod
    async def launch(
        session: AsyncSession,
        project: Project,
        *,
        provider: str,
        environment: str = "production",
    ) -> tuple[Deployment, Any]:
        """Create a provider deployment + its orchestrator run (started in background)."""
        from agency.workflows.orchestrator import workflow_orchestrator

        deployment = Deployment(
            project_id=project.id,
            environment=environment,
            version="0.0.0",
            provider=provider,
            status=DeploymentStatus.DEPLOYING.value,
        )
        session.add(deployment)
        await session.flush()
        run = await workflow_orchestrator.prepare_deploy(
            session,
            project=project,
            deployment=deployment,
            provider=provider,
            environment=environment,
            actor="human",
        )
        await session.refresh(deployment)
        return deployment, run

    @staticmethod
    async def redeploy(session: AsyncSession, project: Project) -> tuple[Deployment, Any]:
        latest = await DeploymentService.status(session, project.id)
        if latest is None or not latest.provider:
            raise ValueError("no provider deployment exists to redeploy")
        return await DeploymentService.launch(
            session,
            project,
            provider=latest.provider,
            environment=latest.environment or "production",
        )

    @staticmethod
    async def remove(
        session: AsyncSession,
        project: Project,
        *,
        deployment: Deployment | None = None,
        actor: str = "human",
    ) -> Deployment:
        deployment = deployment or await DeploymentService.status(session, project.id)
        if deployment is None:
            raise ValueError("no deployment to remove")
        if not deployment.removed and deployment.provider:
            provider = get_provider(deployment.provider)
            if provider is not None:
                profile = profile_for(Path(project.root_dir))
                ctx = ProviderContext(
                    project=project,
                    root=Path(project.root_dir),
                    environment=deployment.environment,
                    deployment_id=deployment.deployment_id,
                    extra={
                        "frontend_dir": profile.frontend_dir,
                        "static_dir": profile.static_dir,
                        "deployment_id": deployment.deployment_id,
                    },
                )
                log = _deployment_logger(deployment)
                try:
                    await provider.remove(ctx, log)
                except DeploymentError as exc:
                    raise ValueError(f"could not tear down the deployment: {exc}") from exc
            deployment.removed = True
            deployment.status = DeploymentStatus.REMOVED.value
            deployment.error = ""
        await audit_record(
            session,
            actor=actor,
            action="delete",
            resource_type="deployment",
            resource_id=str(deployment.id),
            detail={"provider": deployment.provider, "removed": deployment.removed},
        )
        await session.commit()
        return deployment

    @staticmethod
    async def logs(session: AsyncSession, project: Project) -> dict[str, Any]:
        deployment = await DeploymentService.status(session, project.id)
        if deployment is None:
            return {"deployment_id": None, "status": "", "logs": []}
        return {
            "deployment_id": str(deployment.id),
            "status": deployment.status,
            "logs": deployment.logs or [],
        }

    @staticmethod
    async def add_domain(
        session: AsyncSession, project: Project, domain: str
    ) -> dict[str, Any]:
        deployment = await DeploymentService.status(session, project.id)
        if deployment is None or not deployment.provider:
            raise ValueError("deploy the project before attaching a custom domain")
        provider = get_provider(deployment.provider)
        if provider is None:
            raise ValueError(f"unknown provider: {deployment.provider}")
        if not provider.is_configured():
            raise ProviderNotConfigured("Deployment provider is not configured.")
        ctx = _provider_context(deployment, project)
        log = _deployment_logger(deployment)
        result = await provider.add_domain(ctx, log, domain)
        deployment.custom_domain = domain
        deployment.domain_status = result.get("status", "pending_dns")
        deployment.dns_records = result.get("dns_records") or {}
        await audit_record(
            session,
            actor="human",
            action="create",
            resource_type="domain",
            resource_id=str(deployment.id),
            detail={"domain": domain, "status": deployment.domain_status},
        )
        await session.commit()
        return result

    @staticmethod
    async def check_domain(session: AsyncSession, project: Project) -> dict[str, Any]:
        deployment = await DeploymentService.status(session, project.id)
        if deployment is None:
            raise ValueError("no deployment exists for this project")
        if not deployment.custom_domain:
            raise ValueError("no custom domain configured — add one first")
        provider = get_provider(deployment.provider)
        if provider is None or not provider.is_configured():
            raise ProviderNotConfigured("Deployment provider is not configured.")
        ctx = _provider_context(deployment, project)
        log = _deployment_logger(deployment)
        result = await provider.check_domain(ctx, log, deployment.custom_domain)
        deployment.domain_status = result.get("status", deployment.domain_status)
        await session.commit()
        return result


deployment_service = DeploymentService()


def _provider_context(deployment: Deployment, project: Project) -> ProviderContext:
    profile = profile_for(Path(project.root_dir))
    return ProviderContext(
        project=project,
        root=Path(project.root_dir),
        environment=deployment.environment or "production",
        deployment_id=deployment.deployment_id,
        extra={
            "frontend_dir": profile.frontend_dir,
            "static_dir": profile.static_dir,
            "deployment_id": deployment.deployment_id,
        },
    )


def _deployment_logger(deployment: Deployment):
    def log(message: str, level: str = "info", detail: str = "") -> None:
        deployment.logs = [
            *deployment.logs,
            {
                "ts": datetime.now(UTC).isoformat(),
                "level": level,
                "message": message,
                "detail": detail,
            },
        ]

    return log


# --- individual checks ----------------------------------------------------
async def _check_all_tasks_done(session: AsyncSession, project_id: UUID) -> DeploymentCheckResult:
    done = await session.scalar(
        select(func.count(Task.id)).where(
            Task.project_id == project_id, Task.status == TaskStatus.DONE.value
        )
    )
    total = await session.scalar(select(func.count(Task.id)).where(Task.project_id == project_id))
    passed = int(total or 0) > 0 and done == total
    return DeploymentCheckResult(
        name="all_tasks_complete",
        passed=passed,
        detail=f"{done or 0}/{total or 0} tasks complete",
        checked_at=datetime.now(UTC),
    )


async def _check_lint(root: Path) -> DeploymentCheckResult:
    if (root / "backend").exists() and (root / "backend" / "pyproject.toml").exists():
        cmd = "uv run ruff check ."
        try:
            await _run_shell(cmd, root / "backend", timeout=CHECK_TIMEOUT)
            return DeploymentCheckResult(
                name="lint", passed=True, detail="ruff clean", checked_at=datetime.now(UTC)
            )
        except RuntimeError as exc:
            return DeploymentCheckResult(
                name="lint", passed=False, detail=str(exc), checked_at=datetime.now(UTC)
            )
    if (root / "frontend").exists() and (root / "frontend" / "package.json").exists():
        try:
            await _run_shell("npx tsc --noEmit", root / "frontend", timeout=CHECK_TIMEOUT)
            return DeploymentCheckResult(
                name="lint", passed=True, detail="tsc clean", checked_at=datetime.now(UTC)
            )
        except RuntimeError as exc:
            return DeploymentCheckResult(
                name="lint", passed=False, detail=str(exc), checked_at=datetime.now(UTC)
            )
    return DeploymentCheckResult(
        name="lint", passed=True, detail="no code found to lint", checked_at=datetime.now(UTC)
    )


async def _check_tests(root: Path) -> DeploymentCheckResult:
    if not (root / "tests").exists():
        return DeploymentCheckResult(
            name="tests", passed=True, detail="no tests directory", checked_at=datetime.now(UTC)
        )
    test_files = [
        p
        for p in (root / "tests").rglob("*")
        if p.is_file() and p.name.startswith(("test_", "test-"))
    ]
    if not test_files:
        return DeploymentCheckResult(
            name="tests", passed=True, detail="no test files found", checked_at=datetime.now(UTC)
        )
    try:
        await _run_shell("uv run pytest -q", root, timeout=CHECK_TIMEOUT)
        return DeploymentCheckResult(
            name="tests", passed=True, detail="all tests passed", checked_at=datetime.now(UTC)
        )
    except RuntimeError as exc:
        return DeploymentCheckResult(
            name="tests", passed=False, detail=str(exc), checked_at=datetime.now(UTC)
        )


async def _check_docker_compose(root: Path) -> DeploymentCheckResult:
    compose = root / "docker-compose.yml"
    if not compose.exists():
        return DeploymentCheckResult(
            name="docker_build",
            passed=True,
            detail="no compose file (skip)",
            checked_at=datetime.now(UTC),
        )
    try:
        await _run_shell(f"docker compose -f {compose} config -q", root, timeout=CHECK_TIMEOUT)
        return DeploymentCheckResult(
            name="docker_build",
            passed=True,
            detail="compose config valid",
            checked_at=datetime.now(UTC),
        )
    except RuntimeError as exc:
        return DeploymentCheckResult(
            name="docker_build", passed=False, detail=str(exc), checked_at=datetime.now(UTC)
        )


async def _check_config(root: Path) -> DeploymentCheckResult:
    missing = []
    for candidate in [root / "docker-compose.yml", root / "deployment" / "nginx.conf"]:
        if not candidate.exists():
            missing.append(candidate.name)
    if missing:
        return DeploymentCheckResult(
            name="config_validated",
            passed=False,
            detail=f"missing: {missing}",
            checked_at=datetime.now(UTC),
        )
    return DeploymentCheckResult(
        name="config_validated",
        passed=True,
        detail="deployment config present",
        checked_at=datetime.now(UTC),
    )


def _check_secrets(environment: str) -> DeploymentCheckResult:
    settings = get_settings()
    keys = REQUIRED_SECRET_KEYS
    missing = [k for k in keys if not getattr(settings, k.lower(), None) and not _env_or_dotenv(k)]
    return DeploymentCheckResult(
        name="secrets_validated",
        passed=not missing,
        detail="all required secrets present" if not missing else f"missing: {missing}",
        checked_at=datetime.now(UTC),
    )


def _env_or_dotenv(key: str) -> bool:
    import os

    return bool(os.environ.get(key))


def _json_safe(value: Any) -> Any:
    """Recursively convert datetimes (etc.) into JSON-safe primitives."""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


async def _run_shell(command: str, cwd: Path, timeout: int = 120) -> str:
    proc = await asyncio.create_subprocess_shell(
        command, cwd=str(cwd), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    try:
        raw, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        raise RuntimeError(f"command timed out: {command[:120]}") from None
    output = raw.decode("utf-8", errors="replace").strip()
    if proc.returncode not in (0, None):
        raise RuntimeError(output[-1000:] or f"command failed: {command[:120]}")
    return output


def _sh_quote(value: str) -> str:
    """Quote a path for safe interpolation into a shell command."""
    if any(ch in value for ch in " \t\n\"'\\$`"):
        return "'" + value.replace("'", "'\\''") + "'"
    return value
