"""Project deletion: the DELETE endpoint removes DB records and the on-disk folder."""

from __future__ import annotations

import uuid
from pathlib import Path

from agency.services.projects import project_service


async def _create_via_api(client) -> dict:
    resp = await client.post("/api/projects", json={"name": "Delete Me"})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_delete_project_removes_record_and_folder(client) -> None:
    proj = await _create_via_api(client)
    folder = Path(proj["root_dir"])
    assert folder.is_dir()
    assert (folder / "docs" / "README.md").is_file()

    resp = await client.delete(f"/api/projects/{proj['id']}")
    assert resp.status_code == 204, resp.text

    assert not folder.exists()
    listed = (await client.get("/api/projects")).json()
    assert all(p["id"] != proj["id"] for p in listed)
    assert (await client.get(f"/api/projects/{proj['id']}")).status_code == 404


async def test_delete_missing_project_returns_404(client) -> None:
    resp = await client.delete(f"/api/projects/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_delete_missing_folder_still_succeeds(client) -> None:
    import shutil

    proj = await _create_via_api(client)
    folder = Path(proj["root_dir"])
    shutil.rmtree(folder)
    assert not folder.exists()

    resp = await client.delete(f"/api/projects/{proj['id']}")
    assert resp.status_code == 204, resp.text
    assert (await client.get(f"/api/projects/{proj['id']}")).status_code == 404


async def test_delete_only_touches_target_project(client) -> None:
    a = await _create_via_api(client)
    b = await _create_via_api(client)

    resp = await client.delete(f"/api/projects/{a['id']}")
    assert resp.status_code == 204, resp.text

    assert not Path(a["root_dir"]).exists()
    assert Path(b["root_dir"]).is_dir()
    listed = (await client.get("/api/projects")).json()
    assert any(p["id"] == b["id"] for p in listed)


async def test_delete_removes_workflow_runs(client, db) -> None:
    from agency.workflows.engine import workflow_engine

    proj = await _create_via_api(client)
    run = await workflow_engine.start_command_run(
        db, project_id=proj["id"], agents=["planner"], command="Plan the portal"
    )
    await db.commit()

    resp = await client.delete(f"/api/projects/{proj['id']}")
    assert resp.status_code == 204, resp.text

    # Project is gone, so the project-scoped run listing is either empty or a 404.
    runs_resp = await client.get(f"/api/workflows?project_id={proj['id']}")
    if runs_resp.status_code == 404:
        return
    runs = runs_resp.json()
    assert isinstance(runs, list)
    assert run.id not in [r["id"] for r in runs]
