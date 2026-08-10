"""Project endpoints: create, list, detail, milestones, knowledge indexing, plans."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, UploadFile

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
from agency.services.plans import PlanError, plan_service
from agency.services.projects import project_service
from agency.services.tasks import task_service

router = APIRouter(prefix="/projects", tags=["projects"])

MAX_PLAN_BYTES = 2_000_000  # 2 MB


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
