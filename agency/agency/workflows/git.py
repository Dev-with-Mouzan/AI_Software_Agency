"""Best-effort git checkpoints for workflow runs.

Before major implementation stages and after each stage the orchestrator asks
for a checkpoint. This module runs plain `git` commands in the project root so
the workflow can be rolled back safely. Everything is best-effort: if the
project is not a git repository, or git is unavailable, the checkpoint is
silently skipped and reported as skipped rather than failing the run.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

_MESSAGE_LINE = "- {agent}: {summary}"


def _run(root: Path, args: list[str], timeout: float = 20.0) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        cwd=str(root),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def is_git_repo(root: Path) -> bool:
    try:
        proc = _run(root, ["git", "rev-parse", "--is-inside-work-tree"])
        return proc.returncode == 0 and proc.stdout.strip() == "true"
    except Exception:
        return False


def _toplevel(root: Path) -> str:
    try:
        proc = _run(root, ["git", "rev-parse", "--show-toplevel"])
        if proc.returncode != 0:
            return ""
        return (proc.stdout or "").strip()
    except Exception:
        return ""


def _ensure_identity(root: Path, name: str, email: str) -> list[str]:
    """Prepend `-c` config flags when no git identity is configured."""
    try:
        who = _run(root, ["git", "config", "user.name"])
        has_name = who.returncode == 0 and who.stdout.strip()
        who = _run(root, ["git", "config", "user.email"])
        has_email = who.returncode == 0 and who.stdout.strip()
    except Exception:
        return []
    flags: list[str] = []
    if not has_name:
        flags += ["-c", f"user.name={name}"]
    if not has_email:
        flags += ["-c", f"user.email={email}"]
    return flags


def checkpoint(
    root: Path,
    *,
    label: str,
    message: str = "",
    name: str = "DevPilot AI",
    email: str = "agents@devpilot.local",
) -> dict:
    """Create a checkpoint commit in the project repo. Returns a summary dict."""
    if not is_git_repo(root):
        return {"label": label, "created": False, "reason": "not a git repository"}
    # Only checkpoint when the project directory is itself the git root. A
    # project nested inside a larger repo (e.g. working-area inside the agency
    # repo) is skipped so checkpoints never commit unrelated parent changes.
    top = _toplevel(root)
    if not top or Path(top).resolve() != root.resolve():
        return {"label": label, "created": False, "reason": "project is not its own repository"}

    try:
        _run(root, ["git", "add", "-A"])
        identity = _ensure_identity(root, name, email)
        body = f"checkpoint: {label}"
        if message:
            body += f"\n\n{message}"
        proc = _run(root, ["git", "commit", *identity, "-m", body])
        if proc.returncode != 0:
            stderr = (proc.stderr or "").strip()
            if "nothing to commit" in stderr or "no changes added" in stderr:
                return {"label": label, "created": False, "reason": "no changes"}
            logger.warning("git checkpoint commit failed for %s: %s", root, stderr[:300])
            return {"label": label, "created": False, "reason": stderr[:200]}
        rev = _run(root, ["git", "rev-parse", "--short", "HEAD"])
        return {
            "label": label,
            "created": True,
            "commit": (rev.stdout or "").strip(),
            "message": body,
        }
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("git checkpoint skipped for %s: %s", root, exc)
        return {"label": label, "created": False, "reason": str(exc)[:200]}
