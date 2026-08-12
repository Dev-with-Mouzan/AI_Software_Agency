"""Project endpoints: create, list, detail, milestones, knowledge indexing, plans."""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, UploadFile
from sqlalchemy.exc import OperationalError

from agency.api.deps import DbSession
from agency.knowledge.index import KnowledgeBase
from agency.schemas.project import (
    MilestoneIn,
    MilestoneOut,
    PlanUploadOut,
    ProjectCreate,
    ProjectDetailOut,
    ProjectOut,
    ProjectUpdate,
)
from agency.schemas.workspace import WorkspaceTreeOut
from agency.services.plans import PlanError, plan_service
from agency.services.projects import project_service
from agency.services.tasks import task_service
from agency.services.workspace import WorkspaceError, workspace_service

router = APIRouter(prefix="/projects", tags=["projects"])

MAX_PLAN_BYTES = 2_000_000  # 2 MB


async def _delete_project_with_retry(
    session: DbSession, project_id: UUID, *, attempts: int = 4
) -> bool:
    """Delete a project, retrying on SQLite write-lock contention.

    A workflow run may hold the write lock when the human deletes the project
    at the same moment; WAL mode lets concurrent readers through but a DELETE
    needs the single writer slot, so a brief retry avoids spurious 500s.
    """
    for attempt in range(1, attempts + 1):
        try:
            deleted = await project_service.delete(session, project_id, actor="human")
            await session.commit()
            return deleted
        except OperationalError as exc:
            if "locked" not in str(exc).lower() or attempt == attempts:
                raise
            await session.rollback()
            await asyncio.sleep(0.2 * attempt)
    return False


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(payload: ProjectCreate, session: DbSession) -> ProjectOut:
    project = await project_service.create(
        session,
        name=payload.name,
        description=payload.description,
        slug=payload.slug,
        actor="human",
    )
    await session.commit()
    return ProjectOut.model_validate(project)


@router.get("", response_model=list[ProjectOut])
async def list_projects(session: DbSession) -> list[ProjectOut]:
    projects = await project_service.list(session)
    return [ProjectOut.model_validate(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: UUID, session: DbSession) -> ProjectOut:
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    return ProjectOut.model_validate(project)


@router.get("/{project_id}/detail", response_model=ProjectDetailOut)
async def project_detail(project_id: UUID, session: DbSession) -> ProjectDetailOut:
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    stats = await task_service.stats(session, project_id)
    out = ProjectDetailOut.model_validate(project)
    out.task_stats = stats
    return out


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: UUID, payload: ProjectUpdate, session: DbSession
) -> ProjectOut:
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(project, key, value)
    await session.commit()
    return ProjectOut.model_validate(project)


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: UUID, session: DbSession) -> None:
    """Delete a project and all of its dependent records."""
    deleted = await _delete_project_with_retry(session, project_id)
    if not deleted:
        raise HTTPException(404, "project not found")


@router.post("/{project_id}/milestones", response_model=MilestoneOut, status_code=201)
async def add_milestone(project_id: UUID, payload: MilestoneIn, session: DbSession) -> MilestoneOut:
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    milestone = await project_service.add_milestone(
        session,
        project_id=project_id,
        name=payload.name,
        description=payload.description,
        order_index=payload.order_index,
    )
    await session.commit()
    return MilestoneOut.model_validate(milestone)


@router.post("/{project_id}/index", status_code=200)
async def index_knowledge(project_id: UUID, session: DbSession) -> dict:
    """Index project files into the RAG knowledge base."""
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    kb = KnowledgeBase(project_root=Path(project.root_dir))
    count = await kb.index_project(session, project_id, Path(project.root_dir))
    await session.commit()
    return {"indexed": count, "project_id": str(project_id)}


@router.get("/{project_id}/structure", response_model=WorkspaceTreeOut)
async def project_structure(project_id: UUID, session: DbSession) -> WorkspaceTreeOut:
    """Top-level file tree for a project (drives the project viewer)."""
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    try:
        tree = await workspace_service.folder_tree(session, project.slug)
    except WorkspaceError as exc:
        raise HTTPException(404, str(exc)) from exc
    return WorkspaceTreeOut(**tree)


@router.post("/{project_id}/plan", response_model=PlanUploadOut, status_code=201)
async def upload_plan(project_id: UUID, file: UploadFile, session: DbSession) -> PlanUploadOut:
    """Save a user-uploaded implementation plan for the project.

    The plan is written to docs/implementation_plan.md so every agent follows
    it. Skips the Planner — run the engineers directly afterwards.
    """
    filename = (file.filename or "").lower()
    if not filename.endswith((".md", ".markdown", ".txt")):
        raise HTTPException(422, "plan must be a markdown or text file")
    raw = await file.read()
    if len(raw) > MAX_PLAN_BYTES:
        raise HTTPException(413, f"plan file too large (max {MAX_PLAN_BYTES} bytes)")
    content = raw.decode("utf-8", errors="replace")
    try:
        result = await plan_service.save(
            session, project_id=project_id, content=content, source="upload"
        )
    except PlanError as exc:
        raise HTTPException(404, str(exc)) from exc
    return PlanUploadOut(**result)
