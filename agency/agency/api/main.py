"""FastAPI application entrypoint for DevPilot AI."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from agency import __version__
from agency.agents.registry import get_registry
from agency.api import routes
from agency.api.deps import Auth
from agency.api.middleware import RateLimitMiddleware, SecurityHeadersMiddleware
from agency.config import get_settings
from agency.db.session import get_session_factory, init_db
from agency.logging.setup import configure_logging
from agency.observability.metrics import PrometheusMiddleware
from agency.services.settings import (
    AIProviderNotConfiguredError,
    AI_PROVIDER_NOT_CONFIGURED_CODE,
    AI_PROVIDER_NOT_CONFIGURED_MESSAGE,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    settings = get_settings()
    if settings.environment == "production":
        if not settings.api_token:
            raise RuntimeError(
                "API_TOKEN must be set when ENVIRONMENT=production — refusing to start unauthenticated."
            )
        if settings.jwt_secret == "devpilot-dev-insecure-secret-change-me":
            raise RuntimeError(
                "JWT_SECRET must be set to a real secret when ENVIRONMENT=production — "
                "refusing to start with the insecure dev default."
            )
    await init_db()
    # Register employees (idempotent) and load persisted LLM settings.
    async with get_session_factory()() as session:
        from agency.services.settings import load_runtime_settings

        await load_runtime_settings(session)
        await get_registry().seed(session)
        from agency.services.templates import seed_deployment_templates

        await seed_deployment_templates(session)
        from agency.workflows.orchestrator import workflow_orchestrator

        recovered = await workflow_orchestrator.recover_stale_runs(session)
        if recovered:
            logger.warning("recovered %d stale workflow run(s) after restart", recovered)
        await session.commit()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    docs_enabled = settings.environment != "production"
    app = FastAPI(
        title="DevPilot AI",
        description=(
            "Multi-agent platform where specialized AI employees (Planner, Backend, "
            "Frontend, DevOps) work on projects in a working-area folder on your "
            "command — individually or combined, in any order, under human supervision."
        ),
        version=__version__,
        lifespan=lifespan,
        openapi_url="/api/openapi.json" if docs_enabled else None,
        docs_url="/api/docs" if docs_enabled else None,
        redoc_url="/api/redoc" if docs_enabled else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(PrometheusMiddleware)

    @app.exception_handler(AIProviderNotConfiguredError)
    async def _ai_provider_not_configured(
        _: Request, exc: AIProviderNotConfiguredError
    ) -> JSONResponse:
        """Backend enforcement point: dispatch without a configured AI provider
        returns 503 + a machine-readable code instead of faking success."""
        return JSONResponse(
            status_code=503,
            content={
                "detail": str(exc) or AI_PROVIDER_NOT_CONFIGURED_MESSAGE,
                "code": AI_PROVIDER_NOT_CONFIGURED_CODE,
            },
        )

    # Public routers: health checks and auth. The agent roster/runtime GETs are
    # also public (guest browsing); every other endpoint enforces JWT auth via
    # CurrentUser + project ownership per-route.
    app.include_router(routes.health.router, prefix="/api")
    app.include_router(routes.auth.router, prefix="/api")
    app.include_router(routes.projects.router, prefix="/api")
    app.include_router(routes.workspace.router, prefix="/api")
    app.include_router(routes.tasks.router, prefix="/api")
    app.include_router(routes.agents.router, prefix="/api")
    app.include_router(routes.chat.router, prefix="/api")
    app.include_router(routes.memory.router, prefix="/api")
    app.include_router(routes.workflows.router, prefix="/api")
    app.include_router(routes.deployment.router, prefix="/api")
    app.include_router(routes.notifications.router, prefix="/api")
    app.include_router(routes.settings.router, prefix="/api")
    app.include_router(routes.audit.router, prefix="/api")

    @app.get("/metrics")
    async def metrics(_: None = Auth) -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()


def run() -> None:  # pragma: no cover
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "agency.api.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.environment == "development",
    )
