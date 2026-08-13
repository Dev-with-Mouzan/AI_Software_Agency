"""Project service: create projects, milestones, and project workspace scaffolding."""

from __future__ import annotations

import re
from pathlib import Path
from uuid import UUID

import shutil

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.config import get_settings
from agency.db.models import AgentMemory, Milestone, Project, WorkflowRun

PROJECT_WORKSPACES = ["backend", "frontend", "deployment", "docs"]


class ProjectService:
    @staticmethod
    def slugify(name: str) -> str:
        slug = re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-")
        return slug or "project"

    @staticmethod
    def validate_slug(slug: str) -> str:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,100}", slug):
            raise ValueError(
                f"invalid slug: {slug!r} — only lowercase letters, digits and hyphens allowed"
            )
        return slug

    @staticmethod
    async def create(
        session: AsyncSession,
        *,
        name: str,
        description: str = "",
        slug: str | None = None,
        actor: str = "human",
        workspace_mode: str = "structured",
    ) -> Project:
        settings = get_settings()
        final_slug = ProjectService.validate_slug(slug or ProjectService.slugify(name))

        # Ensure uniqueness.
        existing = await session.scalar(select(Project).where(Project.slug == final_slug))
        if existing:
            final_slug = f"{final_slug}-{str(existing.id)[:8]}"

        root = (settings.working_area / final_slug).resolve()
        if not root.is_relative_to(settings.working_area.resolve()):
            raise ValueError(f"project path escapes the working area: {root}")
        project = Project(
            name=name,
            slug=final_slug,
            description=description,
            root_dir=str(root),
            workspace_mode=workspace_mode,
        )
        session.add(project)
        await session.flush()

        # Scaffold workspace directories (skipped for adopted existing repos).
        if workspace_mode == "structured":
            for ws in PROJECT_WORKSPACES:
                (root / ws).mkdir(parents=True, exist_ok=True)
            (root / "docs").joinpath("README.md").write_text(
                f"# {name}\n\n{description}\n", encoding="utf-8"
            )

        from agency.permissions.audit import record

        await record(
            session,
            actor=actor,
            action="create",
            resource_type="project",
            resource_id=str(project.id),
            detail={"slug": final_slug, "workspace_mode": workspace_mode},
        )
        return project

    @staticmethod
    async def get(session: AsyncSession, project_id: UUID) -> Project | None:
        return await session.get(Project, project_id)

    @staticmethod
    async def list(session: AsyncSession) -> list[Project]:
        return list(
            (await session.scalars(select(Project).order_by(Project.created_at.desc()))).all()
        )

    @staticmethod
    async def add_milestone(
        session: AsyncSession,
        *,
        project_id: UUID,
        name: str,
        description: str = "",
        order_index: int = 0,
    ) -> Milestone:
        milestone = Milestone(
            project_id=project_id, name=name, description=description, order_index=order_index
        )
        session.add(milestone)
        await session.flush()
        return milestone

    @staticmethod
    async def root_dir(project: Project) -> Path:
        return Path(project.root_dir)

    @staticmethod
    async def delete(
        session: AsyncSession,
        project_id: UUID,
        *,
        actor: str = "human",
    ) -> bool:
        """Delete a project, its dependent records and its workspace folder.

        Milestones, tasks, comments, knowledge chunks, workflow runs and
        deployments cascade through their FKs; agent memory entries are removed
        explicitly (no FK on `scope_id`). The on-disk workspace folder is
        removed too, but only when it lives safely inside the working area —
        never the working area itself and never a folder outside it. The folder
        is removed *before* the DB rows so a failure aborts the whole deletion
        (nothing is committed) instead of leaving an orphaned record.
        """
        project = await session.get(Project, project_id)
        if project is None:
            return False

        working_area = get_settings().working_area.resolve()
        root_dir = Path(project.root_dir).resolve()
        if root_dir == working_area:
            raise ValueError(f"refusing to delete the working area root: {root_dir}")
        if root_dir.is_relative_to(working_area):
            try:
                shutil.rmtree(root_dir, ignore_errors=False)
            except FileNotFoundError:
                pass
        elif root_dir.exists():
            raise ValueError(f"refusing to delete folder outside the working area: {root_dir}")

        await session.execute(
            delete(AgentMemory).where(
                AgentMemory.scope_type == "project",
                AgentMemory.scope_id == str(project_id),
            )
        )
        await session.execute(
            delete(WorkflowRun).where(WorkflowRun.project_id == project_id)
        )
        await session.execute(delete(Project).where(Project.id == project_id))
        await session.flush()

        from agency.permissions.audit import record

        await record(
            session,
            actor=actor,
            action="delete",
            resource_type="project",
            resource_id=str(project_id),
            detail={"name": project.name, "slug": project.slug},
        )
        return True


project_service = ProjectService()
