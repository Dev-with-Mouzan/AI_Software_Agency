"""Working area endpoints: list folders, create, adopt, inspect."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from agency.api.deps import DbSession
from agency.schemas.workspace import (
    WorkspaceAdopt,
    WorkspaceCreate,
    WorkspaceFolderOut,
    WorkspaceTreeOut,
)
from agency.services.workspace import WorkspaceError, workspace_service

router = APIRouter(prefix="/workspace", tags=["workspace"])


@router.get("/folders", response_model=list[WorkspaceFolderOut])
async def list_folders(session: DbSession) -> list[WorkspaceFolderOut]:
    folders = await workspace_service.list_folders(session)
    return [WorkspaceFolderOut(**f) for f in folders]


@router.post("/folders", response_model=WorkspaceFolderOut, status_code=201)
async def create_folder(payload: WorkspaceCreate, session: DbSession) -> WorkspaceFolderOut:
    try:
        project = await workspace_service.create_project(
            session, name=payload.name, description=payload.description
        )
    except WorkspaceError as exc:
        raise HTTPException(409, str(exc)) from exc
    await session.commit()
    root = workspace_service.root() / project.slug
    return WorkspaceFolderOut(
        name=project.slug,
        slug=project.slug,
        registered=True,
        project_id=project.id,
        file_count=len(list(root.rglob("*"))) if root.exists() else 0,
        root_dir=str(root),
    )


@router.post("/folders/adopt", response_model=WorkspaceFolderOut, status_code=201)
async def adopt_folder(payload: WorkspaceAdopt, session: DbSession) -> WorkspaceFolderOut:
    try:
        project = await workspace_service.adopt_folder(session, payload.folder_name)
    except WorkspaceError as exc:
        raise HTTPException(404, str(exc)) from exc
    await session.commit()
    root = workspace_service.root() / project.slug
    return WorkspaceFolderOut(
        name=project.slug,
        slug=project.slug,
        registered=True,
        project_id=project.id,
        file_count=len(list(root.rglob("*"))) if root.exists() else 0,
        root_dir=str(root),
    )


@router.get("/folders/{slug}/tree", response_model=WorkspaceTreeOut)
async def folder_tree(slug: str, session: DbSession) -> WorkspaceTreeOut:
    try:
        tree = await workspace_service.folder_tree(session, slug)
    except WorkspaceError as exc:
        raise HTTPException(404, str(exc)) from exc
    return WorkspaceTreeOut(**tree)
