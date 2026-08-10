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
from agency.permissions.audit import record as audit_record
from agency.schemas.deployment import DeploymentCheckResult

REQUIRED_SECRET_KEYS = ["DATABASE_URL", "REDIS_URL"]
CHECK_TIMEOUT = 120


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


deployment_service = DeploymentService()


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
