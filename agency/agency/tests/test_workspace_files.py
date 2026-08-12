"""Workspace file endpoints: browse, view, download, zip, traversal guard."""

from __future__ import annotations

import io
import shutil
import zipfile

from agency.services.workspace import workspace_service


async def _seed_folder(slug: str) -> None:
    root = workspace_service.root() / slug
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True, exist_ok=True)
    (root / "backend").mkdir(parents=True, exist_ok=True)
    (root / "backend" / "app.py").write_bytes(b"print('hi')\n")
    (root / "backend" / "data.bin").write_bytes(b"\x00\x01\x02")
    (root / "README.md").write_text("# Hello\n", encoding="utf-8")
    (root / ".env").write_text("SECRET=1\n", encoding="utf-8")
    (root / "node_modules" / "pkg").mkdir(parents=True)
    (root / "node_modules" / "pkg" / "index.js").write_text("x", encoding="utf-8")


async def test_dir_listing_excludes_hidden_and_heavy_dirs(client, project) -> None:
    await _seed_folder(project.slug)
    resp = await client.get(f"/api/workspace/folders/{project.slug}/dir")
    assert resp.status_code == 200
    entries = {e["name"]: e for e in resp.json()["entries"]}
    assert "backend" in entries and entries["backend"]["type"] == "dir"
    assert "README.md" in entries and entries["README.md"]["type"] == "file"
    assert ".env" not in entries
    assert "node_modules" not in entries


async def test_dir_listing_navigates_into_subdirectories(client, project) -> None:
    await _seed_folder(project.slug)
    resp = await client.get(
        f"/api/workspace/folders/{project.slug}/dir", params={"path": "backend"}
    )
    assert resp.status_code == 200
    assert {e["name"] for e in resp.json()["entries"]} == {"app.py", "data.bin"}


async def test_read_file_returns_content_and_flags_binary(client, project) -> None:
    await _seed_folder(project.slug)
    text = await client.get(
        f"/api/workspace/folders/{project.slug}/file", params={"path": "backend/app.py"}
    )
    assert text.status_code == 200
    body = text.json()
    assert body["content"] == "print('hi')\n"
    assert body["binary"] is False

    binary = await client.get(
        f"/api/workspace/folders/{project.slug}/file", params={"path": "backend/data.bin"}
    )
    assert binary.status_code == 200
    assert binary.json()["binary"] is True
    assert binary.json()["content"] == ""


async def test_path_traversal_is_rejected(client, project) -> None:
    await _seed_folder(project.slug)
    for path in ["../secret.txt", "..", "backend/../../x", "C:/windows/win.ini"]:
        resp = await client.get(
            f"/api/workspace/folders/{project.slug}/file", params={"path": path}
        )
        assert resp.status_code == 404, path
        resp = await client.get(f"/api/workspace/folders/{project.slug}/dir", params={"path": path})
        assert resp.status_code == 404, path


async def test_download_single_file(client, project) -> None:
    await _seed_folder(project.slug)
    resp = await client.get(
        f"/api/workspace/folders/{project.slug}/download", params={"path": "backend/app.py"}
    )
    assert resp.status_code == 200
    assert resp.content == b"print('hi')\n"


async def test_download_rejects_sensitive_and_excluded_files(client, project) -> None:
    await _seed_folder(project.slug)
    for path in [".env", "node_modules/pkg/index.js", "backend/../../.env"]:
        resp = await client.get(
            f"/api/workspace/folders/{project.slug}/download", params={"path": path}
        )
        assert resp.status_code == 404, path


async def test_archive_zips_project_without_heavy_dirs(client, project) -> None:
    await _seed_folder(project.slug)
    resp = await client.get(f"/api/workspace/folders/{project.slug}/archive")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/zip")
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = zf.namelist()
    assert "backend/app.py" in names
    assert "README.md" in names
    assert not any("node_modules" in n for n in names)
    assert not any(n.startswith(".env") for n in names)
