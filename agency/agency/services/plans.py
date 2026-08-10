"""Plan service: save a project plan (agent-generated or user-uploaded) to disk,
into the RAG knowledge base and agent memory."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.core.enums import MemoryKind
from agency.db.models import Project
from agency.knowledge.index import KnowledgeBase
from agency.memory.manager import memory_manager
from agency.permissions.audit import record as audit_record

PLAN_FILENAME = "implementation_plan.md"


class PlanError(Exception):
    pass


class PlanService:
    @staticmethod
    async def save(
        session: AsyncSession,
        *,
        project_id: UUID,
        content: str,
        source: str = "upload",
        actor: str = "human",
    ) -> dict:
        project = await session.scalar(select(Project).where(Project.id == project_id))
        if project is None:
            raise PlanError("project not found")

        content = content.strip()
        if not content:
            raise PlanError("plan is empty")

        root = Path(project.root_dir)
        docs = root / "docs"
        try:
            docs.mkdir(parents=True, exist_ok=True)
            plan_file = docs / PLAN_FILENAME
            plan_file.write_text(content, encoding="utf-8")
        except OSError as exc:
            raise PlanError(f"could not write plan: {exc}") from exc

        try:
            kb = KnowledgeBase(project_root=root if root.exists() else None)
            await kb.index_text(
                session,
                title=PLAN_FILENAME,
                source=f"docs/{PLAN_FILENAME}",
                content=content,
                project_id=project.id,
            )
        except Exception:
            pass

        try:
            if memory_manager:
                await memory_manager.write(
                    session,
                    agent_kind="planner",
                    content=content[:3000],
                    kind=MemoryKind.PROJECT.value,
                    scope_type="project",
                    scope_id=str(project.id),
                    importance=0.9,
                    summary="Implementation plan",
                )
        except Exception:
            pass

        await audit_record(
            session,
            actor=actor,
            action="update",
            resource_type="plan",
            resource_id=str(project.id),
            detail={"source": source, "project_id": str(project.id)},
        )
        await session.commit()
        return {
            "path": f"docs/{PLAN_FILENAME}",
            "project_id": str(project.id),
            "source": source,
            "size": len(content),
        }


plan_service = PlanService()
