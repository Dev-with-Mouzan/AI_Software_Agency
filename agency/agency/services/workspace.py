"""Working area service: manage the on-disk project folders.

The working area is a real directory (config.working_area) that the human
controls directly — they drop in an existing repo, or create a folder by name.
This service maps folders to Project records and gives the UI a view of the
folder contents.
"""

from __future__ import annotations

import io
import os
import re
import zipfile
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.config import get_settings
from agency.db.models import Project
from agency.services.projects import project_service

SIZE_CAP = 100_000_000  # don't stat files larger than this for the tree view
FILE_PREVIEW_CAP = 512 * 1024  # cap in-browser file content preview
ARCHIVE_CAP = 500 * 1024 * 1024  # refuse to zip projects larger than this
# Directories that are never listed, previewed or zipped.
_EXCLUDED_DIRS = {".git", "node_modules", ".next", "__pycache__", ".venv", "venv", ".cache", "dist"}
# Dotfiles are hidden from listings and excluded from archives.
_EXCLUDED_PREFIXES = "."

# Files that are never listed, previewed, downloaded or zipped because they
# carry secrets: environment files, private keys, credential stores.
_SENSITIVE_NAMES = {
    "credentials",
    "credentials.json",
    "credentials.yaml",
    "credentials.yml",
    "secrets.json",
    "secrets.yaml",
    "secrets.yml",
    "service-account.json",
    "serviceaccount.json",
    "id_rsa",
    "id_ed25519",
    ".netrc",
    ".npmrc",
    ".pypirc",
    "client_secret.json",
}
_SECRET_VALUE_RE = re.compile(
    r"(?i)((?:api[_-]?key|secret|token|password|passwd|private[_-]?key|"
    r"access[_-]?key|client[_-]?secret|auth|bearer|aws[_-]?(?:secret|access)[_-]?key|"
    r"vercel[_-]?token|database[_-]?url)\b[^=\n]{0,40}=)([^\s\"'`]{4,})"
)
_BEARER_RE = re.compile(r"(?i)(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}")
_AWS_KEY_RE = re.compile(r"\b(AKIA[0-9A-Z]{16})\b")


def _is_sensitive(path: Path) -> bool:
    """True if a file should never be exposed (env files, keys, credential stores)."""
    name = path.name
    if name.startswith(".env"):
        return True
    lowered = name.lower()
    if lowered.endswith((".pem", ".key", ".p12", ".pfx", ".keystore")):
        return True
    if lowered in _SENSITIVE_NAMES:
        return True
    return any(part in {".secrets", ".credentials"} for part in path.parts)


def _redact_secrets(text: str) -> str:
    """Mask secret-looking values (keys, tokens, passwords) before serving text."""
    text = _SECRET_VALUE_RE.sub(r"\1••••••", text)
    text = _BEARER_RE.sub(r"\1••••••", text)
    text = _AWS_KEY_RE.sub("AKIA••••••••••••••••", text)
    return text


class WorkspaceError(Exception):
    pass


def _resolve_inside(root: Path, name: str) -> Path:
    """Resolve `root / name` and guarantee it stays inside `root`."""
    folder = (root / name).resolve()
    if not folder.is_relative_to(root.resolve()):
        raise WorkspaceError(f"folder must live inside the working area: {name}")
    return folder


def _resolve_project_folder(root: Path, slug: str, rel_path: str) -> Path:
    """Resolve a project-relative path and guarantee it stays in the project."""
    folder = _resolve_inside(root, slug)
    if not folder.is_dir():
        raise WorkspaceError(f"no folder named '{slug}' in the working area")
    return _resolve_inside(folder, rel_path)


def _skippable(rel: Path) -> bool:
    """True if a path segment names a heavy/excluded dir or dotfile."""
    return any(part in _EXCLUDED_DIRS or part.startswith(_EXCLUDED_PREFIXES) for part in rel.parts)


def _entry(child: Path) -> dict[str, Any]:
    if child.is_dir():
        return {
            "name": child.name,
            "type": "dir",
            "size": None,
            "children": _count_files(child),
        }
    size = child.stat().st_size if child.stat().st_size <= SIZE_CAP else None
    return {"name": child.name, "type": "file", "size": size, "children": 0}


class WorkspaceService:
    @staticmethod
    def root() -> Path:
        root = get_settings().working_area
        root.mkdir(parents=True, exist_ok=True)
        return root

    @staticmethod
    async def list_folders(
        session: AsyncSession, owner_id: UUID | None = None
    ) -> list[dict[str, Any]]:
        root = WorkspaceService.root()
        projects = {
            p.slug: p for p in await project_service.list(session, owner_id=owner_id)
        }
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
        owner_id: UUID | None = None,
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
            owner_id=owner_id,
        )

    @staticmethod
    async def adopt_folder(
        session: AsyncSession, folder_name: str, owner_id: UUID | None = None
    ) -> Project:
        """Register an existing folder (dropped in by the human) as a project."""
        root = WorkspaceService.root()
        folder = _resolve_inside(root, folder_name)
        if not folder.is_dir():
            raise WorkspaceError(f"no folder named '{folder_name}' in the working area")

        existing = await session.scalar(select(Project).where(Project.slug == folder_name))
        if existing:
            if existing.owner_id is not None and existing.owner_id != owner_id:
                raise WorkspaceError("this folder is already registered to another account")
            return existing

        project = Project(
            name=folder_name.replace("-", " ").replace("_", " ").title(),
            slug=folder_name,
            description="Adopted existing project from the working area.",
            root_dir=str(folder),
            workspace_mode="free",
            owner_id=owner_id,
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
            if child.is_file() and _is_sensitive(child):
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
    async def list_dir(session: AsyncSession, slug: str, rel_path: str = "") -> dict[str, Any]:
        """List one directory inside a project folder (on-demand expansion)."""
        root = WorkspaceService.root()
        folder = _resolve_project_folder(root, slug, rel_path)
        if not folder.is_dir():
            raise WorkspaceError(f"not a directory: {rel_path or '/'}")
        project_root = _resolve_project_folder(root, slug, "")
        entries: list[dict[str, Any]] = []
        for child in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
            if child.name.startswith(_EXCLUDED_PREFIXES):
                continue
            rel = child.relative_to(project_root)
            if child.is_dir() and _skippable(rel):
                continue
            if child.is_file() and _is_sensitive(child):
                continue
            entries.append(_entry(child))
        return {
            "slug": slug,
            "path": rel_path.lstrip("/"),
            "entries": entries,
            "file_count": _count_files(folder),
        }

    @staticmethod
    async def read_file(session: AsyncSession, slug: str, rel_path: str) -> dict[str, Any]:
        """Return a redacted text preview of a file inside a project folder.

        Sensitive files (.env, private keys, credential stores) are never
        served; regular files have secret-looking values masked server-side.
        """
        root = WorkspaceService.root()
        file = _resolve_project_folder(root, slug, rel_path)
        if not file.is_file():
            raise WorkspaceError(f"not a file: {rel_path}")
        size = file.stat().st_size
        if _is_sensitive(file):
            return {
                "path": rel_path.lstrip("/"),
                "name": file.name,
                "size": size,
                "content": "",
                "truncated": False,
                "binary": False,
                "redacted": True,
                "reason": "This file is hidden to protect secrets.",
            }
        binary = False
        with file.open("rb") as fh:
            head = fh.read(8192)
            if b"\x00" in head:
                binary = True
                content = ""
                truncated = False
            else:
                fh.seek(0)
                data = fh.read(FILE_PREVIEW_CAP)
                truncated = len(data) < size
                content = _redact_secrets(data.decode("utf-8", errors="replace"))
        return {
            "path": rel_path.lstrip("/"),
            "name": file.name,
            "size": size,
            "content": content,
            "truncated": truncated,
            "binary": binary,
            "redacted": False,
            "reason": "",
        }

    @staticmethod
    async def resolve_file(session: AsyncSession, slug: str, rel_path: str) -> Path:
        """Resolve a project file path, guaranteed inside the project folder.

        Sensitive files (env files, keys, credential stores), dotfiles and
        files inside excluded/vcs dirs are never served — same policy as the
        preview and archive paths.
        """
        root = WorkspaceService.root()
        file = _resolve_project_folder(root, slug, rel_path)
        if not file.is_file():
            raise WorkspaceError(f"not a file: {rel_path}")
        project_root = _resolve_project_folder(root, slug, "")
        rel = file.relative_to(project_root)
        if _skippable(rel) or _is_sensitive(file):
            raise WorkspaceError(f"file is not available for download: {rel_path}")
        return file

    @staticmethod
    async def project_archive(session: AsyncSession, slug: str) -> tuple[str, io.BytesIO]:
        """Zip the whole project folder (skipping heavy/vcs dirs) into memory."""
        root = WorkspaceService.root()
        folder = _resolve_project_folder(root, slug, "")
        total = 0
        members: list[Path] = []
        for current, dirs, files in os.walk(folder):
            dirs[:] = [d for d in dirs if not _skippable(Path(d))]
            for name in files:
                path = Path(current) / name
                rel = path.relative_to(folder)
                if any(part.startswith(_EXCLUDED_PREFIXES) for part in rel.parts):
                    continue
                if _is_sensitive(path):
                    continue
                total += path.stat().st_size
                if total > ARCHIVE_CAP:
                    raise WorkspaceError(
                        "project is too large to archive "
                        f"(over {ARCHIVE_CAP // (1024 * 1024)} MB after excluding "
                        "node_modules/.git/venv)"
                    )
                members.append(path)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for path in members:
                zf.write(path, arcname=path.relative_to(folder).as_posix())
        buffer.seek(0)
        return f"{slug}.zip", buffer


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
