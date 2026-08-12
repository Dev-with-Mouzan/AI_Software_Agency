"""Deployment provider abstraction.

A provider owns the real, provider-specific work: building the project,
shipping it, verifying it is live, attaching custom domains and tearing it
down. Providers read their own credentials from environment variables and
NEVER return them — the frontend only ever sees deployment metadata (URLs,
ids, status).

The orchestrator drives a deployment through four stages
(validate → build → deploy → verify) by calling provider methods with a
`ProviderContext`; each stage streams honest progress into the deployment's
log through the `LogFn` callback.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

LogFn = Callable[[str, str, str], None]  # (message, level, detail)


class DeploymentError(Exception):
    """Raised when a provider cannot do what was asked (config, API, build…)."""


@dataclass
class ProviderContext:
    project: Any  # Project ORM row (lazy to avoid a hard import cycle)
    root: Path
    environment: str
    deployment_id: str = ""

    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderDeployResult:
    deployment_url: str
    deployment_id: str
    project_url: str = ""
    detail: str = ""


class BaseProvider:
    """Shared helpers for providers that run local shell commands."""

    name = "base"
    label = "Base"

    async def shell(
        self,
        command: str,
        cwd: Path,
        log: LogFn,
        *,
        timeout: int = 600,
        env: dict[str, str] | None = None,
    ) -> str:
        import asyncio
        import os

        log(command, "command", "")
        full_env = {**os.environ, **(env or {})}
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=full_env,
        )
        try:
            raw, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except TimeoutError:
            proc.kill()
            raise DeploymentError(f"command timed out: {command[:120]}") from None
        output = raw.decode("utf-8", errors="replace").strip()
        if proc.returncode not in (0, None):
            tail = output[-1200:]
            log(tail, "error", "")
            raise DeploymentError(tail or f"command failed: {command[:120]}")
        if output:
            log(output[-400:], "output", "")
        return output

    @staticmethod
    def env(*names: str) -> dict[str, str]:
        import os

        found: dict[str, str] = {}
        for name in names:
            value = os.environ.get(name)
            if value:
                found[name] = value
        return found


def short_commit(root: Path) -> str:
    """Best-effort short git hash for the deployed commit."""
    import subprocess

    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=5,
        )
        return out.stdout.strip() if out.returncode == 0 else ""
    except Exception:
        return ""
