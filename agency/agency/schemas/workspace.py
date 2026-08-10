"""Working area schemas."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)


class WorkspaceAdopt(BaseModel):
    folder_name: str = Field(min_length=1, max_length=220)


class FolderEntry(BaseModel):
    name: str
    type: str
    size: int | None = None
    children: int = 0


class WorkspaceFolderOut(BaseModel):
    name: str
    slug: str
    registered: bool
    project_id: UUID | None = None
    file_count: int = 0
    root_dir: str = ""


class WorkspaceTreeOut(BaseModel):
    slug: str
    root_dir: str
    registered: bool
    project_id: UUID | None = None
    entries: list[FolderEntry] = Field(default_factory=list)
    file_count: int = 0
