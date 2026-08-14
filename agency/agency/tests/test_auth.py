"""Authentication: verification, sign-up, login, tokens, profile, isolation."""

from __future__ import annotations

from uuid import UUID

from httpx import ASGITransport, AsyncClient


def _auth_headers(access: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access}"}


# 1x1 transparent PNG.
_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


async def _signup(client, email: str = "bob@devpilot.ai", password: str = "password123"):
    """Full mandatory-verification sign-up: send code -> verify -> create.

    In tests SMTP is unconfigured, so /send-code returns the code as `dev_code`.
    Returns the first non-2xx response, or the final signup response.
    """
    sent = await client.post("/api/auth/send-code", json={"email": email})
    if sent.status_code != 200:
        return sent
    dev_code = sent.json().get("dev_code")
    assert dev_code, f"expected dev_code in test env: {sent.text}"

    verified = await client.post(
        "/api/auth/verify-code", json={"email": email, "code": dev_code}
    )
    if verified.status_code != 200:
        return verified

    return await client.post(
        "/api/auth/signup",
        json={
            "email": email,
            "name": "Bob",
            "password": password,
            "verification_token": verified.json()["verification_token"],
        },
    )


async def _second_client(access: str):
    from agency.api.main import app

    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test", headers=_auth_headers(access))


async def test_signup_returns_tokens_and_me(client_noauth) -> None:
    resp = await _signup(client_noauth)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "bob@devpilot.ai"
    assert body["user"]["provider"] == "email"
    assert body["user"]["email_verified"] is True

    me = await client_noauth.get("/api/auth/me", headers=_auth_headers(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "bob@devpilot.ai"
    assert me.json()["email_verified"] is True


async def test_signup_duplicate_email_409(client_noauth) -> None:
    assert (await _signup(client_noauth, email="dup@devpilot.ai")).status_code == 201
    dup = await _signup(client_noauth, email="DUP@devpilot.ai")
    assert dup.status_code == 409


async def test_signup_rejects_weak_password(client_noauth) -> None:
    resp = await _signup(client_noauth, password="short")
    assert resp.status_code == 422


async def test_login_and_use_protected_endpoint(client_noauth) -> None:
    await _signup(client_noauth, email="alice@devpilot.ai")
    login = await client_noauth.post(
        "/api/auth/login", json={"email": "alice@devpilot.ai", "password": "password123"}
    )
    assert login.status_code == 200, login.text
    body = login.json()
    assert body["access_token"]

    projects = await client_noauth.get("/api/projects", headers=_auth_headers(body["access_token"]))
    assert projects.status_code == 200


async def test_login_wrong_password_401(client_noauth) -> None:
    await _signup(client_noauth, email="carol@devpilot.ai")
    resp = await client_noauth.post(
        "/api/auth/login", json={"email": "carol@devpilot.ai", "password": "wrong-password"}
    )
    assert resp.status_code == 401


async def test_guest_blocked_from_protected_endpoints(client_noauth) -> None:
    assert (await client_noauth.get("/api/projects")).status_code == 401
    assert (await client_noauth.post("/api/projects", json={"name": "X"})).status_code == 401
    assert (await client_noauth.post("/api/chat", json={"message": "hi"})).status_code == 401
    assert (await client_noauth.get("/api/workflows?project_id=00000000-0000-0000-0000-000000000000")).status_code == 401
    assert (await client_noauth.get("/api/settings/llm")).status_code == 401
    assert (await client_noauth.get("/api/notifications")).status_code == 401


async def test_guest_can_browse_public_endpoints(client_noauth) -> None:
    health = await client_noauth.get("/api/health")
    assert health.status_code == 200
    agents = await client_noauth.get("/api/agents")
    assert agents.status_code == 200
    kinds = {a["kind"] for a in agents.json()}
    assert "planner" in kinds


async def test_refresh_rotates_tokens(client_noauth) -> None:
    await _signup(client_noauth, email="dave@devpilot.ai")
    login = await client_noauth.post(
        "/api/auth/login", json={"email": "dave@devpilot.ai", "password": "password123"}
    )
    old_refresh = login.json()["refresh_token"]

    refreshed = await client_noauth.post(
        "/api/auth/refresh", json={"refresh_token": old_refresh}
    )
    assert refreshed.status_code == 200, refreshed.text
    new_access = refreshed.json()["access_token"]
    assert (await client_noauth.get("/api/auth/me", headers=_auth_headers(new_access))).status_code == 200

    # Old token is revoked after rotation.
    replay = await client_noauth.post("/api/auth/refresh", json={"refresh_token": old_refresh})
    assert replay.status_code == 401


async def test_logout_revokes_refresh(client_noauth) -> None:
    await _signup(client_noauth, email="erin@devpilot.ai")
    login = await client_noauth.post(
        "/api/auth/login", json={"email": "erin@devpilot.ai", "password": "password123"}
    )
    refresh = login.json()["refresh_token"]

    out = await client_noauth.post("/api/auth/logout", json={"refresh_token": refresh})
    assert out.status_code == 204

    replay = await client_noauth.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert replay.status_code == 401


async def test_access_token_expired_rejected(client_noauth) -> None:
    await _signup(client_noauth, email="frank@devpilot.ai")
    login = await client_noauth.post(
        "/api/auth/login", json={"email": "frank@devpilot.ai", "password": "password123"}
    )
    from agency.security import create_access_token

    user_id = login.json()["user"]["id"]
    expired = create_access_token(user_id, ttl_seconds=-10)
    resp = await client_noauth.get("/api/auth/me", headers=_auth_headers(expired))
    assert resp.status_code == 401


async def test_cross_user_project_isolation(client, client_noauth) -> None:
    mine = (await client.post("/api/projects", json={"name": "Mine"})).json()
    theirs = (await client.post("/api/projects", json={"name": "Theirs"})).json()

    other = (await _signup(client_noauth, email="mallory@devpilot.ai")).json()
    async with await _second_client(other["access_token"]) as attacker:
        # Attacker sees none of user A's projects.
        listed = (await attacker.get("/api/projects")).json()
        assert all(p["id"] not in {mine["id"], theirs["id"]} for p in listed)

        # Direct access to a foreign project is forbidden.
        assert (await attacker.get(f"/api/projects/{mine['id']}")).status_code == 403
        assert (await attacker.get(f"/api/projects/{mine['id']}/detail")).status_code == 403
        assert (
            await attacker.post(
                f"/api/projects/{mine['id']}/tasks", json={"title": "sneak"}
            )
        ).status_code == 403
        assert (
            await attacker.get(f"/api/workspace/folders/{mine['slug']}/tree")
        ).status_code == 403
        assert (
            await attacker.post(
                "/api/agents/run",
                json={
                    "project_id": mine["id"],
                    "agents": ["planner"],
                    "command": "x",
                },
            )
        ).status_code == 403

        # Foreign workflow run / deployment are hidden too.
        workflow_run = (
            await client.post(
                "/api/agents/run",
                json={
                    "project_id": mine["id"],
                    "agents": ["planner"],
                    "command": "Plan",
                },
            )
        ).json()
        assert (await attacker.get(f"/api/workflows/{workflow_run['id']}")).status_code == 403

        # Owner still has full access.
        assert (await client.get(f"/api/projects/{theirs['id']}")).status_code == 200


async def test_legacy_ownerless_project_inaccessible(client, db) -> None:
    from agency.services.projects import project_service

    # Create a project directly with no owner (simulating a pre-auth record).
    p = await project_service.create(db, name="Legacy", description="pre-auth")
    await db.commit()

    assert (await client.get(f"/api/projects/{p.id}")).status_code == 403
    listed = (await client.get("/api/projects")).json()
    assert all(x["id"] != str(p.id) for x in listed)


async def test_unauth_client_cannot_run_agents(client_noauth) -> None:
    resp = await client_noauth.post(
        "/api/agents/run",
        json={
            "project_id": str(UUID(int=1)),
            "agents": ["planner"],
            "command": "x",
        },
    )
    assert resp.status_code == 401


async def test_send_code_rejects_disposable_email(client_noauth) -> None:
    resp = await client_noauth.post(
        "/api/auth/send-code", json={"email": "someone@mailinator.com"}
    )
    assert resp.status_code == 422


async def test_send_code_rejects_existing_account(client_noauth) -> None:
    resp = await _signup(client_noauth, email="taken@devpilot.ai")
    assert resp.status_code == 201
    again = await client_noauth.post(
        "/api/auth/send-code", json={"email": "taken@devpilot.ai"}
    )
    assert again.status_code == 409


async def test_verify_code_wrong_code_422(client_noauth) -> None:
    sent = await client_noauth.post(
        "/api/auth/send-code", json={"email": "vera@devpilot.ai"}
    )
    assert sent.status_code == 200
    resp = await client_noauth.post(
        "/api/auth/verify-code", json={"email": "vera@devpilot.ai", "code": "000000"}
    )
    assert resp.status_code == 422


async def test_signup_requires_verification(client_noauth) -> None:
    resp = await client_noauth.post(
        "/api/auth/signup",
        json={"email": "noverify@devpilot.ai", "name": "N", "password": "password123"},
    )
    assert resp.status_code == 422
    assert "verification_token" in str(resp.json()["detail"]).lower()


async def test_signup_verification_mismatch_rejected(client_noauth) -> None:
    sent = await client_noauth.post(
        "/api/auth/send-code", json={"email": "match@devpilot.ai"}
    )
    code = sent.json()["dev_code"]
    verified = await client_noauth.post(
        "/api/auth/verify-code", json={"email": "match@devpilot.ai", "code": code}
    )
    token = verified.json()["verification_token"]

    resp = await client_noauth.post(
        "/api/auth/signup",
        json={
            "email": "other@devpilot.ai",
            "name": "N",
            "password": "password123",
            "verification_token": token,
        },
    )
    assert resp.status_code == 422


async def test_update_profile_name(client) -> None:
    me = await client.patch("/api/auth/me", json={"name": "Renamed"})
    assert me.status_code == 200, me.text
    assert me.json()["name"] == "Renamed"


async def test_update_profile_avatar_lifecycle(client, user) -> None:
    me = await client.patch("/api/auth/me", json={"avatar": _PNG_DATA_URL})
    assert me.status_code == 200, me.text
    avatar_url = me.json()["avatar_url"]
    assert avatar_url.startswith("/auth/avatar/")
    assert avatar_url.split("/")[-1] == str(user.id)

    # Public avatar endpoint serves the image without credentials.
    img = await client.get(f"/api{avatar_url}")
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/png"

    # Removing the avatar clears the URL and 404s the endpoint.
    removed = await client.patch("/api/auth/me", json={"avatar": None})
    assert removed.status_code == 200
    assert removed.json()["avatar_url"] == ""
    assert (await client.get(f"/api{avatar_url}")).status_code == 404


async def test_update_profile_avatar_rejects_bad_payload(client) -> None:
    resp = await client.patch(
        "/api/auth/me", json={"avatar": "data:image/png;base64,not-base64!!!"}
    )
    assert resp.status_code == 422


async def test_update_profile_name_keeps_avatar(client) -> None:
    me = await client.patch("/api/auth/me", json={"avatar": _PNG_DATA_URL})
    assert me.status_code == 200
    avatar_url = me.json()["avatar_url"]

    renamed = await client.patch("/api/auth/me", json={"name": "Renamed"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"
    assert renamed.json()["avatar_url"] == avatar_url
