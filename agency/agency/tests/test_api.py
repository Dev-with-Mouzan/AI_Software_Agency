"""End-to-end API tests over the full stack."""

from __future__ import annotations

import asyncio
import time
import uuid

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from agency.api.middleware import RateLimitMiddleware


async def _wait_run(client, run_id, timeout: float = 10.0) -> dict:
    """Poll a run until it leaves the RUNNING state (background execution)."""
    deadline = time.monotonic() + timeout
    while True:
        resp = await client.get(f"/api/workflows/{run_id}")
        assert resp.status_code == 200, resp.text
        run = resp.json()
        if run["status"] not in {"RUNNING", "IN_PROGRESS", "PENDING"}:
            return run
        if time.monotonic() > deadline:
            raise AssertionError(f"run {run_id} did not finish within {timeout}s")
        await asyncio.sleep(0.05)


async def test_health(client) -> None:
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "version" in body


async def test_create_and_list_projects(client) -> None:
    resp = await client.post(
        "/api/projects", json={"name": "API Test Project", "description": "desc"}
    )
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]
    list_resp = await client.get("/api/projects")
    assert any(p["id"] == project_id for p in list_resp.json())


async def test_task_lifecycle_via_api(client) -> None:
    proj = (await client.post("/api/projects", json={"name": "T"})).json()
    task = (
        await client.post(
            f"/api/projects/{proj['id']}/tasks",
            json={"title": "Implement auth", "owner": "backend_engineer", "priority": "HIGH"},
        )
    ).json()
    assert task["status"] == "TODO"

    upd = (await client.patch(f"/api/tasks/{task['id']}", json={"status": "IN_PROGRESS"})).json()
    assert upd["status"] == "IN_PROGRESS"

    comment = (
        await client.post(f"/api/tasks/{task['id']}/comments", json={"author": "qa", "body": "ok"})
    ).json()
    assert comment["body"] == "ok"

    board = (await client.get(f"/api/projects/{proj['id']}/board")).json()
    assert board and board[0]["id"] == task["id"]


async def test_invalid_transition_rejected(client) -> None:
    proj = (await client.post("/api/projects", json={"name": "T2"})).json()
    task = (await client.post(f"/api/projects/{proj['id']}/tasks", json={"title": "x"})).json()
    resp = await client.patch(f"/api/tasks/{task['id']}", json={"status": "DONE"})
    assert resp.status_code == 422


async def test_agents_endpoints(client) -> None:
    resp = await client.get("/api/agents")
    assert resp.status_code == 200
    kinds = {a["kind"] for a in resp.json()}
    assert "backend_engineer" in kinds
    assert "frontend_engineer" in kinds
    assert "code_reviewer" in kinds
    runtime = await client.get("/api/agents/runtime")
    assert runtime.status_code == 200


async def test_chat_routes_to_planner(client) -> None:
    resp = await client.post("/api/chat", json={"message": "Plan a new portal project"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent_kind"] == "planner"


async def test_chat_routes_review_to_code_reviewer(client) -> None:
    resp = await client.post("/api/chat", json={"message": "Review the project for security flaws"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent_kind"] == "code_reviewer"
    assert body["reply"]


async def test_memory_search(client) -> None:
    await client.post(
        "/api/memory",
        json={"agent_kind": "backend_engineer", "content": "PostgreSQL chosen for persistence"},
    )
    resp = await client.post(
        "/api/memory/search",
        json={"agent_kind": "backend_engineer", "query": "which database?", "k": 3},
    )
    assert resp.status_code == 200
    assert resp.json()["results"]


async def test_command_run_via_api(client) -> None:
    proj = (await client.post("/api/projects", json={"name": "WF"})).json()
    created = (
        await client.post(
            "/api/agents/run",
            json={"project_id": proj["id"], "agents": ["planner"], "command": "Plan a portal"},
        )
    ).json()
    assert created["status"] == "RUNNING"
    assert created["kind"] == "command"

    run = await _wait_run(client, created["id"])
    assert run["status"] == "COMPLETED"
    assert run["steps"], "steps should be persisted"
    assert [s["agent_kind"] for s in run["steps"]] == ["planner"]

    listed = (await client.get(f"/api/workflows?project_id={proj['id']}")).json()
    assert any(r["id"] == run["id"] for r in listed)


async def test_workflow_activity_endpoint(client) -> None:
    proj = (await client.post("/api/projects", json={"name": "ACT"})).json()
    created = (
        await client.post(
            "/api/agents/run",
            json={"project_id": proj["id"], "agents": ["planner"], "command": "Plan a portal"},
        )
    ).json()
    await _wait_run(client, created["id"])

    feed = (await client.get(f"/api/workflows/{created['id']}/activity")).json()
    assert feed["run_id"] == created["id"]
    assert feed["done"] is True
    assert feed["activities"], "run should record activity events"
    assert feed["activities"][0]["kind"] in {"run", "step", "phase", "reasoning", "tool"}

    missing = await client.get(f"/api/workflows/{uuid.uuid4()}/activity")
    assert missing.status_code == 404


async def test_activity_shows_every_step(client) -> None:
    """Every agent step must surface as its own section in the activity feed.

    Covers both the live feed and the synthetic fallback (after the in-memory
    store is cleared, e.g. a server restart) for a multi-step run.
    """
    from agency.observability.activity import activity_store

    proj = (await client.post("/api/projects", json={"name": "MULTI"})).json()
    created = (
        await client.post(
            "/api/agents/run",
            json={
                "project_id": proj["id"],
                "agents": ["planner", "backend_engineer"],
                "command": "Plan a portal",
            },
        )
    ).json()
    await _wait_run(client, created["id"], timeout=30)
    run_id = created["id"]

    feed = (await client.get(f"/api/workflows/{run_id}/activity")).json()
    step_kinds = {a["agent_kind"] for a in feed["activities"] if a["kind"] == "step"}
    assert step_kinds == {"planner", "backend_engineer"}

    activity_store.clear(run_id)
    synthetic = (await client.get(f"/api/workflows/{run_id}/activity")).json()
    assert synthetic["done"] is True
    step_events = [a for a in synthetic["activities"] if a["kind"] == "step"]
    assert [a["agent_kind"] for a in step_events] == ["planner", "backend_engineer"]
    assert all(a["status"] in {"completed", "failed"} for a in step_events)


async def test_workspace_endpoints(client) -> None:
    resp = await client.post("/api/workspace/folders", json={"name": "my-app"})
    assert resp.status_code == 201, resp.text
    root = resp.json()
    assert root["slug"] == "my-app"
    assert root["registered"] is True

    listed = await client.get("/api/workspace/folders")
    assert listed.status_code == 200
    assert any(d["slug"] == "my-app" for d in listed.json())

    tree = await client.get(f"/api/workspace/folders/{root['slug']}/tree")
    assert tree.status_code == 200
    assert tree.json()["slug"] == "my-app"

    from agency.config import get_settings

    adopt_dir = get_settings().working_area / "existing-repo"
    adopt_dir.mkdir(parents=True, exist_ok=True)
    (adopt_dir / "package.json").write_text("{}", encoding="utf-8")
    adopted = (
        await client.post("/api/workspace/folders/adopt", json={"folder_name": "existing-repo"})
    ).json()
    assert adopted["registered"] is True


async def test_unknown_agent_in_run_rejected(client) -> None:
    proj = (await client.post("/api/projects", json={"name": "BAD"})).json()
    resp = await client.post(
        "/api/agents/run",
        json={"project_id": proj["id"], "agents": ["mystery"], "command": "x"},
    )
    assert resp.status_code == 422


async def test_plan_upload_then_run(client) -> None:
    proj = (await client.post("/api/projects", json={"name": "PLANUP"})).json()
    upload = await client.post(
        f"/api/projects/{proj['id']}/plan",
        files={"file": ("implementation_plan.md", "# My Plan\n\nBuild it.", "text/markdown")},
    )
    assert upload.status_code == 201, upload.text
    body = upload.json()
    assert body["path"] == "docs/implementation_plan.md"
    assert body["source"] == "upload"

    bad_ext = await client.post(
        f"/api/projects/{proj['id']}/plan",
        files={"file": ("plan.pdf", b"pdf", "application/pdf")},
    )
    assert bad_ext.status_code == 422

    created = (
        await client.post(
            "/api/agents/run",
            json={
                "project_id": proj["id"],
                "agents": ["backend_engineer"],
                "command": "Build per the plan",
                "plan_source": "upload",
            },
        )
    ).json()
    assert created["status"] == "RUNNING"
    run = await _wait_run(client, created["id"])
    assert run["status"] == "COMPLETED"
    assert run["context"]["plan_source"] == "upload"

    planner_rejected = await client.post(
        "/api/agents/run",
        json={
            "project_id": proj["id"],
            "agents": ["planner", "backend_engineer"],
            "command": "x",
            "plan_source": "upload",
        },
    )
    assert planner_rejected.status_code == 422


async def test_deployment_validate_endpoint(client) -> None:
    proj = (await client.post("/api/projects", json={"name": "DEP"})).json()
    resp = await client.get(f"/api/projects/{proj['id']}/deployments/validate")
    assert resp.status_code == 200
    body = resp.json()
    assert {c["name"] for c in body["checks"]} >= {
        "all_tasks_complete",
        "lint",
        "tests",
        "docker_build",
        "secrets_validated",
        "config_validated",
    }


async def test_unknown_project_404(client) -> None:
    resp = await client.get(f"/api/projects/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_rate_limiter_returns_429() -> None:
    app = FastAPI()

    @app.get("/limited")
    async def limited():
        return {"ok": True}

    app.add_middleware(RateLimitMiddleware, max_requests=3, window=60.0)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        for _ in range(3):
            assert (await ac.get("/limited")).status_code == 200
        assert (await ac.get("/limited")).status_code == 429


async def test_rate_limiter_exempts_health() -> None:
    app = FastAPI()

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    app.add_middleware(RateLimitMiddleware, max_requests=1, window=60.0)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        assert (await ac.get("/api/health")).status_code == 200
        assert (await ac.get("/api/health")).status_code == 200
