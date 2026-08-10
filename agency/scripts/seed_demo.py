"""Seed a demo project and kick off the build_project workflow.

Usage:
    uv run python -m scripts.seed_demo [project-name]
"""

from __future__ import annotations

import asyncio
import sys

from agency.db.session import get_session_factory, init_db
from agency.logging.setup import configure_logging, get_logger
from agency.services.projects import project_service
from agency.workflows.engine import workflow_engine


async def main_async() -> None:
    configure_logging()
    log = get_logger("scripts.seed_demo")
    name = sys.argv[1] if len(sys.argv) > 1 else "Acme Portal"

    await init_db()
    async with get_session_factory()() as session:
        project = await project_service.create(
            session,
            name=name,
            description="Demo project seeded by scripts/seed_demo.py. Builds a portal with a FastAPI backend and a Next.js dashboard.",
            actor="human",
        )
        await session.commit()
        log.info("project created", project=project.slug, id=str(project.id))

        run = await workflow_engine.start_command_run(
            session,
            project_id=project.id,
            agents=["planner", "backend_engineer", "frontend_engineer", "devops_engineer"],
            command=f"Build '{name}' from scratch.",
            extra={"environment": "staging", "version": "0.1.0", "platform": "docker"},
            actor="human",
        )
        await session.commit()
        log.info("command run started", run=str(run.id), status=run.status, step=run.current_step)
        print(
            f"\nProject: {project.name} (slug: {project.slug}, id: {project.id})\n"
            f"Command run: {run.id} status={run.status}\n"
            f"View run: GET /api/workflows/{run.id}\n"
        )


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
