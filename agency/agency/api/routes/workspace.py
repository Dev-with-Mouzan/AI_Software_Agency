"""Working area endpoints: list folders, create, adopt, inspect, browse files."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse

from agency.api.deps import CurrentUser, DbSession
from agency.api.ownership import require_owned_project
from agency.services.projects import project_service
from agency.schemas.workspace import (
    DirListingOut,
    FileContentOut,
    WorkspaceAdopt,
    WorkspaceCreate,
    WorkspaceFolderOut,
    WorkspaceTreeOut,
)
from agency.services.workspace import WorkspaceError, workspace_service

router = APIRouter(prefix="/workspace", tags=["workspace"])


@router.get("/folders", response_model=list[WorkspaceFolderOut])
async def list_folders(session: DbSession, user: CurrentUser) -> list[WorkspaceFolderOut]:
    folders = await workspace_service.list_folders(session, owner_id=user.id)
    return [WorkspaceFolderOut(**f) for f in folders]


@router.post("/folders", response_model=WorkspaceFolderOut, status_code=201)
async def create_folder(
    payload: WorkspaceCreate, session: DbSession, user: CurrentUser
) -> WorkspaceFolderOut:
    try:
        project = await workspace_service.create_project(
            session,
            name=payload.name,
            description=payload.description,
            owner_id=user.id,
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
async def adopt_folder(
    payload: WorkspaceAdopt, session: DbSession, user: CurrentUser
) -> WorkspaceFolderOut:
    try:
        project = await workspace_service.adopt_folder(
            session, payload.folder_name, owner_id=user.id
        )
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


async def _owned_project_by_slug(session: DbSession, slug: str, user) -> None:
    project = await project_service.get_by_slug(session, slug)
    if project is None:
        raise HTTPException(404, "project not found")
    if project.owner_id != user.id:
        raise HTTPException(403, "you do not have access to this project")


@router.get("/folders/{slug}/tree", response_model=WorkspaceTreeOut)
async def folder_tree(
    slug: str, session: DbSession, user: CurrentUser
) -> WorkspaceTreeOut:
    await _owned_project_by_slug(session, slug, user)
    try:
        tree = await workspace_service.folder_tree(session, slug)
    except WorkspaceError as exc:
        raise HTTPException(404, str(exc)) from exc
    return WorkspaceTreeOut(**tree)


@router.get("/folders/{slug}/dir", response_model=DirListingOut)
async def folder_dir(
    slug: str,
    session: DbSession,
    user: CurrentUser,
    path: str = Query("", description="project-relative directory path"),
) -> DirListingOut:
    await _owned_project_by_slug(session, slug, user)
    try:
        listing = await workspace_service.list_dir(session, slug, path)
    except WorkspaceError as exc:
        raise HTTPException(404, str(exc)) from exc
    return DirListingOut(**listing)


@router.get("/folders/{slug}/file", response_model=FileContentOut)
async def read_project_file(
    slug: str,
    session: DbSession,
    user: CurrentUser,
    path: str = Query(..., description="project-relative file path"),
) -> FileContentOut:
    await _owned_project_by_slug(session, slug, user)
    try:
        content = await workspace_service.read_file(session, slug, path)
    except WorkspaceError as exc:
        raise HTTPException(404, str(exc)) from exc
    return FileContentOut(**content)


@router.get("/folders/{slug}/download")
async def download_file(
    slug: str,
    session: DbSession,
    user: CurrentUser,
    path: str = Query(..., description="project-relative file path"),
) -> FileResponse:
    await _owned_project_by_slug(session, slug, user)
    try:
        file = await workspace_service.resolve_file(session, slug, path)
    except WorkspaceError as exc:
        raise HTTPException(404, str(exc)) from exc
    return FileResponse(file, filename=file.name)


@router.get("/folders/{slug}/archive")
async def download_archive(
    slug: str, session: DbSession, user: CurrentUser
) -> StreamingResponse:
    await _owned_project_by_slug(session, slug, user)
    try:
        filename, buffer = await workspace_service.project_archive(session, slug)
    except WorkspaceError as exc:
        raise HTTPException(404, str(exc)) from exc
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
