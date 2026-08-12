"""AWS provider — static hosting on S3 (+ optional CloudFront).

Credentials are read from the environment on every call and never leave the
server: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
`AWS_BUCKET` (required to deploy), and optional `AWS_CLOUDFRONT_ID` for a
CDN + custom domains. All real work goes through the AWS CLI so no AWS SDK
dependency is needed.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from agency.deployments.base import (
    BaseProvider,
    DeploymentError,
    ProviderContext,
    ProviderDeployResult,
)


class AWSProvider(BaseProvider):
    name = "aws"
    label = "AWS (S3 + CloudFront)"

    # --- configuration ------------------------------------------------
    def is_configured(self) -> bool:
        return bool(self._access_key() and self._secret_key() and self._bucket())

    def config_status(self) -> list[str]:
        missing = []
        if not self._access_key():
            missing.append("AWS_ACCESS_KEY_ID")
        if not self._secret_key():
            missing.append("AWS_SECRET_ACCESS_KEY")
        if not self._bucket():
            missing.append("AWS_BUCKET")
        return missing

    def _access_key(self) -> str:
        return os.environ.get("AWS_ACCESS_KEY_ID", "")

    def _secret_key(self) -> str:
        return os.environ.get("AWS_SECRET_ACCESS_KEY", "")

    def _region(self) -> str:
        return os.environ.get("AWS_REGION", "us-east-1")

    def _bucket(self) -> str:
        return os.environ.get("AWS_BUCKET", "")

    def _distribution(self) -> str:
        return os.environ.get("AWS_CLOUDFRONT_ID", "")

    def _env(self) -> dict[str, str]:
        return {
            "AWS_ACCESS_KEY_ID": self._access_key(),
            "AWS_SECRET_ACCESS_KEY": self._secret_key(),
            "AWS_DEFAULT_REGION": self._region(),
            "AWS_EC2_METADATA_DISABLED": "true",
        }

    # --- compatibility ------------------------------------------------
    def compatible(self, profile: Any) -> tuple[bool, str]:
        if profile.has_frontend:
            return True, f"Hosts the frontend build on S3 ({profile.frontend_dir}/dist)."
        if profile.is_static:
            return True, "Hosts the static site on S3."
        return False, "AWS provider hosts static frontends (S3 + CloudFront)."

    # --- helpers ------------------------------------------------------
    def _output_dir(self, ctx: ProviderContext) -> Path:
        frontend = ctx.extra.get("frontend_dir")
        if frontend:
            base = ctx.root / str(frontend)
            for name in ("dist", "build"):
                candidate = base / name
                if candidate.is_dir():
                    return candidate
        if ctx.extra.get("static_dir"):
            return ctx.root / str(ctx.extra["static_dir"])
        raise DeploymentError(
            "no static build output found — expected frontend/dist, frontend/build "
            "or a static site directory"
        )

    async def _cloudfront_domain(self, log) -> str:
        out = await self.shell(
            f"aws cloudfront get-distribution --id {self._distribution()} "
            "--query Distribution.DomainName --output text",
            Path("."),
            log,
            timeout=60,
            env=self._env(),
        )
        domain = out.strip().splitlines()[-1].strip() if out else ""
        if not domain:
            raise DeploymentError("could not resolve the CloudFront domain name")
        return domain

    # --- stages -------------------------------------------------------
    async def build(self, ctx: ProviderContext, log) -> None:
        frontend = ctx.extra.get("frontend_dir")
        if not frontend:
            log("No frontend dir — deploying the static site as-is.", "info", "")
            return
        site = ctx.root / str(frontend)
        pkg = site / "package.json"
        if not pkg.is_file():
            raise DeploymentError("no package.json found in the frontend for an AWS build")
        try:
            manifest = json.loads(pkg.read_text(encoding="utf-8"))
        except Exception as exc:
            raise DeploymentError(f"invalid package.json: {exc}") from exc
        scripts = manifest.get("scripts") or {}
        if not (isinstance(scripts, dict) and scripts.get("build")):
            raise DeploymentError(
                "the frontend has no build script; add one that emits frontend/dist "
                "for an S3 deployment"
            )
        if not (site / "node_modules").is_dir():
            lock = site / "package-lock.json"
            await self.shell("npm ci" if lock.is_file() else "npm install", site, log, timeout=900)
        await self.shell("npm run build", site, log, timeout=900)
        out = self._output_dir(ctx)
        if not (out / "index.html").is_file():
            log(
                f"Build output {out.relative_to(ctx.root)} has no index.html — "
                "the site may still be served from its root.",
                "warn",
                "",
            )
        log(f"Build complete — staging {out.relative_to(ctx.root)} to S3.", "info", "")

    async def deploy(self, ctx: ProviderContext, log) -> ProviderDeployResult:
        out = self._output_dir(ctx)
        prefix = str(ctx.project.slug)
        await self.shell(
            f"aws s3 sync {self._quote(str(out))} s3://{self._bucket()}/{prefix} "
            f"--region {self._region()} --delete",
            ctx.root,
            log,
            timeout=900,
            env=self._env(),
        )
        log(
            f"Uploaded {out.relative_to(ctx.root)} to s3://{self._bucket()}/{prefix}/.",
            "info",
            "",
        )

        if self._distribution():
            domain = await self._cloudfront_domain(log)
            await self.shell(
                f"aws cloudfront create-invalidation --distribution-id {self._distribution()} "
                f"--paths \"/{prefix}/*\" --query Invalidation.Id --output text",
                ctx.root,
                log,
                timeout=120,
                env=self._env(),
            )
            url = f"https://{domain}/{prefix}/"
            deployment_id = f"cloudfront:{self._distribution()}:{prefix}"
        else:
            url = f"http://{self._bucket()}.s3-website-{self._region()}.amazonaws.com/{prefix}/"
            deployment_id = f"s3:{self._bucket()}:{prefix}"

        log(f"Deployed to {url}", "info", f"deployment id {deployment_id}")
        return ProviderDeployResult(
            deployment_url=url,
            deployment_id=deployment_id,
            project_url=url,
            detail=f"S3 prefix {prefix}",
        )

    async def verify(self, ctx: ProviderContext, log, result: ProviderDeployResult) -> dict[str, Any]:
        status_code = await self._probe(result.deployment_url, log)
        ok = status_code is not None and status_code < 500
        if not ok:
            log(
                "Files are uploaded, but the bucket is not publicly reachable yet — "
                "enable Static website hosting and a public-read bucket policy.",
                "warn",
                "",
            )
        log(
            f"Deployment is live — {result.deployment_url} (HTTP {status_code})." if ok
            else f"Deployment uploaded, HTTP probe returned {status_code}.",
            "info" if ok else "warn",
            "",
        )
        return {
            "verified": ok,
            "status_code": status_code,
            "url": result.deployment_url,
        }

    async def add_domain(self, ctx: ProviderContext, log, domain: str) -> dict[str, Any]:
        if not self._distribution():
            raise DeploymentError(
                "Custom domains on AWS require a CloudFront distribution — "
                "set AWS_CLOUDFRONT_ID."
            )
        cf_domain = await self._cloudfront_domain(log)
        records = [
            {
                "type": "CNAME",
                "name": domain,
                "value": cf_domain,
                "ttl": 300,
                "note": "Point the domain at your CloudFront distribution.",
            }
        ]
        log(
            f"Domain {domain} mapped to CloudFront {cf_domain} (DNS not touched automatically).",
            "info",
            "",
        )
        return {
            "domain": domain,
            "status": "pending_dns",
            "dns_records": records,
            "message": (
                f"Create a CNAME from {domain} to {cf_domain}, then verify DNS. "
                "Attach the domain as an alternate name in CloudFront and request an "
                "ACM certificate for HTTPS."
            ),
        }

    async def check_domain(self, ctx: ProviderContext, log, domain: str) -> dict[str, Any]:
        status_code = await self._probe(f"https://{domain}", log)
        ssl_ok = status_code is not None and status_code < 500
        active = ssl_ok
        log(
            f"HTTPS reachable: {ssl_ok} (HTTP {status_code})."
            if ssl_ok
            else f"Domain not reachable over HTTPS yet (HTTP {status_code}).",
            "info" if active else "warn",
            "",
        )
        return {
            "domain": domain,
            "status": "active" if active else "pending_dns",
            "verified": active,
            "ssl": "active" if ssl_ok else "pending",
            "message": (
                "Domain is live and serving over HTTPS."
                if active
                else "The domain is not serving over HTTPS yet — check the CNAME "
                "record, the CloudFront alternate name and the ACM certificate."
            ),
        }

    async def remove(self, ctx: ProviderContext, log) -> None:
        prefix = str(ctx.project.slug)
        await self.shell(
            f"aws s3 rm --recursive s3://{self._bucket()}/{prefix} --region {self._region()}",
            ctx.root,
            log,
            timeout=600,
            env=self._env(),
        )
        if self._distribution():
            await self.shell(
                f"aws cloudfront create-invalidation --distribution-id {self._distribution()} "
                f"--paths \"/{prefix}/*\" --query Invalidation.Id --output text",
                ctx.root,
                log,
                timeout=120,
                env=self._env(),
            )
        log(f"Removed s3://{self._bucket()}/{prefix}/.", "info", "")

    # --- internal -----------------------------------------------------
    @staticmethod
    def _quote(value: str) -> str:
        return "'" + value.replace("'", "'\\''") + "'" if " " in value else value

    async def _probe(self, url: str, log) -> int | None:
        import httpx

        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                resp = await client.get(url)
                return resp.status_code
        except Exception as exc:
            log(f"HTTP probe failed: {exc}", "warn", "")
            return None


aws_provider = AWSProvider()
