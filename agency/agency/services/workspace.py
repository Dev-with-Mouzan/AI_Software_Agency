"""Working area service: manage the on-disk project folders.

The working area is a real directory (config.working_area) that the human
controls directly — they drop in an existing repo, or create a folder by name.
This service maps folders to Project records and gives the UI a view of the
folder contents.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.config import get_settings
from agency.db.models import Project
from agency.services.projects import project_service

SIZE_CAP = 100_000_000  # don't stat files larger than this for the tree view


class WorkspaceError(Exception):
    pass


def _resolve_inside(root: Path, name: str) -> Path:
    """Resolve `root / name` and guarantee it stays inside `root`."""
    folder = (root / name).resolve()
    if not folder.is_relative_to(root.resolve()):
        raise WorkspaceError(f"folder must live inside the working area: {name}")
    return folder


class WorkspaceService:
    @staticmethod
    def root() -> Path:
        root = get_settings().working_area
        root.mkdir(parents=True, exist_ok=True)
        return root

    @staticmethod
    async def list_folders(session: AsyncSession) -> list[dict[str, Any]]:
        root = WorkspaceService.root()
        projects = {p.slug: p for p in await project_service.list(session)}
        folders: list[dict[str, Any]] = []
        for folder in sorted(root.iterdir(), key=lambda p: p.name.lower()):
            if not folder.is_dir() or folder.name.startswith("."):
                continue
            project = projects.get(folder.name)
            folders.append(
                {
                    "name": folder.name,
                    "slug": folder.name,
                    "registered": project is not None,
                    "project_id": str(project.id) if project else None,
                    "file_count": _count_files(folder),
                    "root_dir": str(folder),
                }
            )
        return folders

    @staticmethod
    async def create_project(
        session: AsyncSession,
        *,
        name: str,
        description: str = "",
    ) -> Project:
        root = WorkspaceService.root()
        root.mkdir(parents=True, exist_ok=True)
        slug = project_service.slugify(name)
        folder = root / slug
        if folder.exists():
            raise WorkspaceError(f"a folder named '{slug}' already exists in the working area")
        return await project_service.create(
            session,
            name=name,
            description=description,
            slug=slug,
            actor="human",
            workspace_mode="structured",
        )

    @staticmethod
    async def adopt_folder(session: AsyncSession, folder_name: str) -> Project:
        """Register an existing folder (dropped in by the human) as a project."""
        root = WorkspaceService.root()
        folder = _resolve_inside(root, folder_name)
        if not folder.is_dir():
            raise WorkspaceError(f"no folder named '{folder_name}' in the working area")

        existing = await session.scalar(select(Project).where(Project.slug == folder_name))
        if existing:
            return existing

        project = Project(
            name=folder_name.replace("-", " ").replace("_", " ").title(),
            slug=folder_name,
            description="Adopted existing project from the working area.",
            root_dir=str(folder),
            workspace_mode="free",
        )
        session.add(project)
        await session.flush()
        from agency.permissions.audit import record

        await record(
            session,
            actor="human",
            action="create",
            resource_type="project",
            resource_id=str(project.id),
            detail={"slug": folder_name, "workspace_mode": "free"},
        )
        return project

    @staticmethod
    async def folder_tree(session: AsyncSession, slug: str) -> dict[str, Any]:
        root = WorkspaceService.root()
        folder = _resolve_inside(root, slug)
        if not folder.is_dir():
            raise WorkspaceError(f"no folder named '{slug}' in the working area")

        project = await session.scalar(select(Project).where(Project.slug == slug))
        entries: list[dict[str, Any]] = []
        for child in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
            if child.name.startswith("."):
                continue
            if child.is_dir():
                entries.append(
                    {
                        "name": child.name,
                        "type": "dir",
                        "size": None,
                        "children": _count_files(child),
                    }
                )
            else:
                size = child.stat().st_size if child.stat().st_size <= SIZE_CAP else None
                entries.append({"name": child.name, "type": "file", "size": size, "children": 0})

        return {
            "slug": slug,
            "root_dir": str(folder),
            "registered": project is not None,
            "project_id": str(project.id) if project else None,
            "entries": entries,
            "file_count": _count_files(folder),
        }

    @staticmethod
    async def project_for_folder(session: AsyncSession, slug: str) -> Project | None:
        return await session.scalar(select(Project).where(Project.slug == slug))


def _count_files(folder: Path) -> int:
    try:
        return sum(
            1
            for p in folder.rglob("*")
            if p.is_file()
            and not any(
                part in {".git", "node_modules", ".next", "__pycache__", ".venv", "venv"}
                for part in p.relative_to(folder).parts
            )
        )
    except OSError:
        return 0


workspace_service = WorkspaceService()
