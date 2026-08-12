"""Vercel provider — deploys through the Vercel REST API.

Credentials are read from the environment on every call and never leave the
server: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. The frontend
only ever sees the resulting deployment URLs and ids.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

import httpx

from agency.deployments.base import (
    BaseProvider,
    DeploymentError,
    ProviderContext,
    ProviderDeployResult,
)

API_BASE = "https://api.vercel.com"
EXCLUDED = {".git", "node_modules", ".next", "dist", "__pycache__", ".venv", "venv", ".cache"}
MAX_TOTAL = 90 * 1024 * 1024  # honest cap for a single deployment upload
POLL_TIMEOUT = 240
POLL_INTERVAL = 3


class VercelProvider(BaseProvider):
    name = "vercel"
    label = "Vercel"

    # --- configuration ------------------------------------------------
    def is_configured(self) -> bool:
        return bool(self._token() and self._project_id())

    def config_status(self) -> list[str]:
        missing = []
        if not self._token():
            missing.append("VERCEL_TOKEN")
        if not self._project_id():
            missing.append("VERCEL_PROJECT_ID")
        return missing

    def _token(self) -> str:
        return os.environ.get("VERCEL_TOKEN", "")

    def _project_id(self) -> str:
        return os.environ.get("VERCEL_PROJECT_ID", "")

    # --- compatibility ------------------------------------------------
    def compatible(self, profile: Any) -> tuple[bool, str]:
        if profile.has_frontend:
            return True, f"Hosts the frontend at {profile.frontend_dir}/."
        if profile.is_static:
            return True, "Hosts the static site."
        return False, "Vercel hosts frontend/static projects; no frontend detected."

    # --- helpers ------------------------------------------------------
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token()}",
            "Content-Type": "application/json",
        }

    def _site_dir(self, ctx: ProviderContext) -> Path:
        if ctx.extra.get("frontend_dir"):
            return ctx.root / str(ctx.extra["frontend_dir"])
        if ctx.extra.get("static_dir"):
            path = ctx.root / str(ctx.extra["static_dir"])
            return path if path != ctx.root else ctx.root
        return ctx.root

    def _collect_files(self, site: Path, log) -> list[dict[str, Any]]:
        members: list[dict[str, Any]] = []
        total = 0
        for current, dirs, files in os.walk(site):
            dirs[:] = [d for d in dirs if d not in EXCLUDED and not d.startswith(".")]
            for name in files:
                path = Path(current) / name
                rel = path.relative_to(site)
                if any(part in EXCLUDED or part.startswith(".") for part in rel.parts):
                    continue
                try:
                    data = path.read_bytes()
                except OSError as exc:
                    raise DeploymentError(f"cannot read {rel}: {exc}") from exc
                total += len(data)
                if total > MAX_TOTAL:
                    raise DeploymentError(
                        "project is too large for a single Vercel deployment upload "
                        f"(over {MAX_TOTAL // (1024 * 1024)} MB after excluding "
                        "node_modules/.next/dist)"
                    )
                members.append(
                    {
                        "file": rel.as_posix(),
                        "sha": hashlib.sha1(data).hexdigest(),
                        "size": len(data),
                        "_data": data,
                    }
                )
        if not members:
            raise DeploymentError("no files to upload for this deployment")
        log(f"Collected {len(members)} files to upload ({total // 1024} KB).", "info", "")
        return members

    # --- stages -------------------------------------------------------
    async def build(self, ctx: ProviderContext, log) -> None:
        frontend = ctx.extra.get("frontend_dir")
        if not frontend:
            log("No frontend build script — Vercel will build on its platform.", "info", "")
            return
        site = ctx.root / str(frontend)
        pkg = site / "package.json"
        if not pkg.is_file():
            log("No package.json — Vercel will serve files as-is.", "info", "")
            return
        try:
            manifest = json.loads(pkg.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}
        scripts = manifest.get("scripts") or {}
        has_build = isinstance(scripts, dict) and bool(scripts.get("build"))
        if not has_build:
            log("No build script — Vercel will build on its platform.", "info", "")
            return
        if not (site / "node_modules").is_dir():
            lock = site / "package-lock.json"
            cmd = "npm ci" if lock.is_file() else "npm install"
            await self.shell(cmd, site, log, timeout=900)
        await self.shell("npm run build", site, log, timeout=900)
        log("Local build passed — shipping to Vercel.", "info", "")

    async def deploy(self, ctx: ProviderContext, log) -> ProviderDeployResult:
        site = self._site_dir(ctx)
        members = self._collect_files(site, log)

        async with httpx.AsyncClient(base_url=API_BASE, timeout=120) as client:
            for member in members:
                resp = await client.post(
                    "/v13/files",
                    params={"sha": member["sha"]},
                    content=member.pop("_data"),
                    headers={"Authorization": f"Bearer {self._token()}"},
                )
                if resp.status_code >= 300:
                    raise DeploymentError(self._api_error(resp, "upload files"))
            log(f"Uploaded {len(members)} files to Vercel.", "info", "")

            target = "production" if ctx.environment.lower() == "production" else "preview"
            static = not ctx.extra.get("frontend_dir") and not self._has_package_json(site)
            project_settings: dict[str, Any] = {}
            if static:
                project_settings = {
                    "framework": None,
                    "buildCommand": None,
                    "installCommand": None,
                    "outputDirectory": ".",
                }
            body = {
                "name": str(ctx.project.slug)[:64],
                "target": target,
                "files": [
                    {"file": m["file"], "sha": m["sha"], "size": m["size"]} for m in members
                ],
            }
            if project_settings:
                body["projectSettings"] = project_settings

            resp = await client.post(
                "/v13/deployments",
                json=body,
                headers=self._headers(),
            )
            if resp.status_code >= 300:
                raise DeploymentError(self._api_error(resp, "create deployment"))
            payload = resp.json()
            deployment_id = str(payload.get("id") or "")
            url = str(payload.get("url") or "").lower().rstrip("/")
            if not deployment_id or not url:
                raise DeploymentError("Vercel did not return a deployment id or url")
            log(
                f"Deployment created: {url} (target: {target}).",
                "info",
                f"deployment id {deployment_id}",
            )
            return ProviderDeployResult(
                deployment_url=f"https://{url}",
                deployment_id=deployment_id,
                project_url=f"https://{url}",
                detail=payload.get("readyState", ""),
            )

    async def verify(self, ctx: ProviderContext, log, result: ProviderDeployResult) -> dict[str, Any]:
        async with httpx.AsyncClient(base_url=API_BASE, timeout=60) as client:
            import asyncio

            deadline = asyncio.get_event_loop().time() + POLL_TIMEOUT
            ready = ""
            while asyncio.get_event_loop().time() < deadline:
                resp = await client.get(
                    f"/v13/deployments/{result.deployment_id}",
                    headers={"Authorization": f"Bearer {self._token()}"},
                )
                if resp.status_code >= 300:
                    raise DeploymentError(self._api_error(resp, "poll deployment"))
                payload = resp.json()
                ready = str(payload.get("readyState") or "")
                if ready in {"READY", "ERROR", "CANCELED"}:
                    break
                await asyncio.sleep(POLL_INTERVAL)
            if ready == "ERROR":
                raise DeploymentError("Vercel reported an error building this deployment.")
            if ready != "READY":
                raise DeploymentError(
                    f"Deployment did not become ready within {POLL_TIMEOUT}s (state {ready})."
                )

        status_code = await self._probe(result.deployment_url, log)
        ok = status_code is not None and status_code < 500
        log(
            f"Deployment is live — {result.deployment_url} (HTTP {status_code})." if ok
            else f"Deployment READY on Vercel, but HTTP probe returned {status_code}.",
            "info" if ok else "warn",
            "",
        )
        return {
            "verified": ok,
            "ready_state": ready,
            "status_code": status_code,
            "url": result.deployment_url,
        }

    async def add_domain(self, ctx: ProviderContext, log, domain: str) -> dict[str, Any]:
        if not self._project_id():
            raise DeploymentError("VERCEL_PROJECT_ID is not configured.")
        async with httpx.AsyncClient(base_url=API_BASE, timeout=60) as client:
            resp = await client.post(
                f"/v13/projects/{self._project_id()}/domains",
                json={"name": domain},
                headers=self._headers(),
            )
            if resp.status_code >= 300:
                raise DeploymentError(self._api_error(resp, "attach domain"))
        records = [
            {"type": "CNAME", "name": domain, "value": "cname.vercel-dns.com", "ttl": 300},
            {
                "type": "ALIAS",
                "name": f"@{domain}",
                "value": "cname.vercel-dns.com",
                "note": "Use for the apex domain (some registrars call this ANCHOR/ALIAS).",
            },
        ]
        log(f"Domain {domain} attached to the Vercel project.", "info", "")
        return {
            "domain": domain,
            "status": "pending_dns",
            "dns_records": records,
            "message": (
                f"Create a CNAME from {domain} to cname.vercel-dns.com "
                "(or an ALIAS record for the apex), then verify DNS."
            ),
        }

    async def check_domain(self, ctx: ProviderContext, log, domain: str) -> dict[str, Any]:
        verified = False
        api_message = ""
        if self._project_id():
            async with httpx.AsyncClient(base_url=API_BASE, timeout=60) as client:
                resp = await client.get(
                    f"/v13/projects/{self._project_id()}/domains/{domain}",
                    headers={"Authorization": f"Bearer {self._token()}"},
                )
                if resp.status_code < 300:
                    data = resp.json()
                    verified = bool(data.get("verified"))
                    api_message = str(data.get("message") or "")
                elif resp.status_code == 404:
                    api_message = "domain is not attached to this Vercel project"
                else:
                    api_message = self._api_error(resp, "check domain")

        ssl_ok = False
        status_code = await self._probe(f"https://{domain}", log)
        ssl_ok = status_code is not None and status_code < 500
        active = verified and ssl_ok
        log(
            f"DNS verified: {verified} · HTTPS reachable: {ssl_ok}."
            if api_message
            else f"DNS verified: {verified} · HTTPS reachable: {ssl_ok} — {api_message}",
            "info" if active else "warn",
            "",
        )
        return {
            "domain": domain,
            "status": "active" if active else ("pending_dns" if verified else "failed"),
            "verified": verified,
            "ssl": "active" if ssl_ok else "pending",
            "message": (
                "Domain is live and serving over HTTPS."
                if active
                else (
                    "DNS record detected; waiting for the domain to serve over HTTPS."
                    if verified
                    else "DNS is not pointing at Vercel yet."
                )
            ),
        }

    async def remove(self, ctx: ProviderContext, log) -> None:
        deployment_id = ctx.extra.get("deployment_id") or ctx.deployment_id
        if not deployment_id:
            log("No deployment id to remove.", "info", "")
            return
        async with httpx.AsyncClient(base_url=API_BASE, timeout=60) as client:
            resp = await client.delete(
                f"/v13/deployments/{deployment_id}",
                headers={"Authorization": f"Bearer {self._token()}"},
            )
            if resp.status_code >= 300 and resp.status_code != 404:
                raise DeploymentError(self._api_error(resp, "remove deployment"))
        log(f"Removed deployment {deployment_id} from Vercel.", "info", "")

    # --- internal -----------------------------------------------------
    def _has_package_json(self, site: Path) -> bool:
        return (site / "package.json").is_file()

    def _api_error(self, resp: httpx.Response, action: str) -> str:
        try:
            payload = resp.json()
            err = payload.get("error") or {}
            message = (
                str(err.get("message"))
                if isinstance(err, dict) and err.get("message")
                else str(payload.get("message") or "")
            )
            if message:
                return f"Vercel {action} failed: {message}"
        except Exception:
            pass
        return f"Vercel {action} failed (HTTP {resp.status_code})."

    async def _probe(self, url: str, log) -> int | None:
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                resp = await client.get(url)
                return resp.status_code
        except Exception as exc:
            log(f"HTTP probe failed: {exc}", "warn", "")
            return None


vercel_provider = VercelProvider()
