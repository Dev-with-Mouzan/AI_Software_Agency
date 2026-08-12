"""Project profile detection for deployment compatibility.

Reads `docs/architecture.json` when the Planner produced one, then inspects the
working tree to decide which providers can host this project. The result feeds
the compatibility-driven provider picker in the UI — incompatible targets are
simply not offered.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ProjectProfile:
    project_type: str = ""
    tech_stack: dict = field(default_factory=dict)
    has_frontend: bool = False
    has_backend: bool = False
    is_static: bool = False
    has_vercel_json: bool = False
    has_docker_compose: bool = False
    frontend_dir: str = ""
    static_dir: str = ""

    @property
    def description(self) -> str:
        if self.project_type:
            return self.project_type
        if self.has_frontend and self.has_backend:
            return "full-stack app"
        if self.has_frontend:
            return "frontend app"
        if self.is_static:
            return "static site"
        if self.has_backend:
            return "backend service"
        return "project"


def detect_project(root: Path) -> ProjectProfile:
    profile = ProjectProfile()
    if not root.exists():
        return profile

    arch = _read_architecture(root)
    if arch:
        profile.project_type = str(arch.get("project_type") or "")
        stack = arch.get("technology_stack")
        if isinstance(stack, dict):
            profile.tech_stack = stack

    for candidate in ("frontend", "apps/web", "client", "web"):
        if (root / candidate).is_dir():
            profile.has_frontend = True
            profile.frontend_dir = candidate
            break
    for candidate in ("backend", "apps/api", "server", "api"):
        if (root / candidate).is_dir():
            profile.has_backend = True
            break

    if (root / "vercel.json").is_file():
        profile.has_vercel_json = True
    if (root / "docker-compose.yml").is_file():
        profile.has_docker_compose = True

    # A static site: no build tooling, but serves plain HTML/CSS/JS.
    for candidate in ("public", "site", "static", "dist"):
        if (root / candidate).is_dir() and (root / candidate / "index.html").is_file():
            profile.is_static = True
            profile.static_dir = candidate
            break
    if not profile.is_static and (root / "index.html").is_file():
        profile.is_static = True
        profile.static_dir = "."

    if profile.has_frontend and not profile.has_backend:
        profile.project_type = profile.project_type or "frontend app"
    return profile


def _read_architecture(root: Path) -> dict:
    try:
        path = root / "docs" / "architecture.json"
        if not path.is_file():
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}
