"""FastAPI application entrypoint for the AI Software Agency."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    settings = get_settings()
    if settings.environment == "production" and not settings.api_token:
        raise RuntimeError(
            "API_TOKEN must be set when ENVIRONMENT=production — refusing to start unauthenticated."
        )
    await init_db()
    # Register employees (idempotent).
    async with get_session_factory()() as session:
        await get_registry().seed(session)
        from agency.services.templates import seed_deployment_templates

        await seed_deployment_templates(session)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    docs_enabled = settings.environment != "production"
    app = FastAPI(
        title="AI Software Agency",
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

    app.include_router(routes.health.router, prefix="/api", dependencies=[Auth])
    app.include_router(routes.projects.router, prefix="/api", dependencies=[Auth])
    app.include_router(routes.workspace.router, prefix="/api", dependencies=[Auth])
    app.include_router(routes.tasks.router, prefix="/api", dependencies=[Auth])
    app.include_router(routes.agents.router, prefix="/api", dependencies=[Auth])
    app.include_router(routes.chat.router, prefix="/api", dependencies=[Auth])
    app.include_router(routes.memory.router, prefix="/api", dependencies=[Auth])
    app.include_router(routes.workflows.router, prefix="/api", dependencies=[Auth])
    app.include_router(routes.deployment.router, prefix="/api", dependencies=[Auth])
    app.include_router(routes.notifications.router, prefix="/api", dependencies=[Auth])
    app.include_router(routes.settings.router, prefix="/api", dependencies=[Auth])

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
