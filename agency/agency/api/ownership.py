"""Authorization helpers: enforce project ownership for nested resources.

Every project-scoped resource (task, workflow run, deployment, milestone)
resolves back to its project and the current user must own that project.
Legacy projects with no owner are inaccessible (403).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException

from agency.api.deps import DbSession
from agency.db.models import Deployment, Project, Task, User, WorkflowRun
from agency.services.projects import project_service


def _403() -> HTTPException:
    return HTTPException(403, "you do not have access to this project")


async def require_owned_project(session: DbSession, project_id: UUID, user: User) -> Project:
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    if project.owner_id != user.id:
        raise _403()
    return project


async def require_owned_task(session: DbSession, task_id: UUID, user: User) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    await require_owned_project(session, task.project_id, user)
    return task


async def require_owned_workflow_run(session: DbSession, run_id: UUID, user: User) -> WorkflowRun:
    run = await session.get(WorkflowRun, run_id)
    if run is None:
        raise HTTPException(404, "workflow run not found")
    if run.project_id is None:
        raise _403()
    await require_owned_project(session, run.project_id, user)
    return run


async def require_owned_deployment(
    session: DbSession, deployment_id: UUID, user: User
) -> Deployment:
    deployment = await session.get(Deployment, deployment_id)
    if deployment is None:
        raise HTTPException(404, "deployment not found")
    await require_owned_project(session, deployment.project_id, user)
    return deployment
