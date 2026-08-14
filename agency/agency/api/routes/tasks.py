"""Task endpoints: CRUD, comments, board."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from agency.api.deps import CurrentUser, DbSession
from agency.api.ownership import require_owned_project, require_owned_task
from agency.db.models import Task
from agency.schemas.task import (
    TaskBoardRow,
    TaskCommentIn,
    TaskCommentOut,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from agency.services.tasks import task_service

router = APIRouter(tags=["tasks"])


@router.post("/projects/{project_id}/tasks", response_model=TaskOut, status_code=201)
async def create_task(
    project_id: UUID, payload: TaskCreate, session: DbSession, user: CurrentUser
) -> TaskOut:
    await require_owned_project(session, project_id, user)
    task = await task_service.create(
        session,
        project_id=project_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        milestone_id=payload.milestone_id,
        owner=payload.owner,
        dependencies=payload.dependencies,
        files_affected=payload.files_affected,
        estimated_points=payload.estimated_points,
        actor="human",
    )
    await session.commit()
    fresh_task = await session.scalar(
        select(Task).options(selectinload(Task.comments)).where(Task.id == task.id)
    )
    if fresh_task is None:
        raise HTTPException(500, "task not found after commit")
    return TaskOut.model_validate(fresh_task)


@router.get("/tasks", response_model=list[TaskOut])
async def list_tasks(
    session: DbSession,
    user: CurrentUser,
    project_id: UUID | None = None,
    status: str | None = None,
    owner: str | None = None,
) -> list[TaskOut]:
    if project_id is None:
        raise HTTPException(400, "project_id is required")
    await require_owned_project(session, project_id, user)
    tasks = await task_service.list_tasks(
        session, project_id=project_id, status=status, owner=owner
    )
    return [TaskOut.model_validate(t) for t in tasks]


@router.get("/tasks/{task_id}", response_model=TaskOut)
async def get_task(task_id: UUID, session: DbSession, user: CurrentUser) -> TaskOut:
    task = await require_owned_task(session, task_id, user)
    return TaskOut.model_validate(task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: UUID, payload: TaskUpdate, session: DbSession, user: CurrentUser
) -> TaskOut:
    await require_owned_task(session, task_id, user)
    try:
        task = await task_service.update(
            session, task_id, fields=payload.model_dump(exclude_unset=True), actor="human"
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if task is None:
        raise HTTPException(404, "task not found")
    await session.commit()
    return TaskOut.model_validate(task)


@router.post("/tasks/{task_id}/comments", response_model=TaskCommentOut, status_code=201)
async def add_comment(
    task_id: UUID, payload: TaskCommentIn, session: DbSession, user: CurrentUser
) -> TaskCommentOut:
    await require_owned_task(session, task_id, user)
    comment = await task_service.add_comment(
        session, task_id=task_id, author=payload.author, body=payload.body
    )
    await session.commit()
    return TaskCommentOut.model_validate(comment)


@router.get("/projects/{project_id}/board", response_model=list[TaskBoardRow])
async def task_board(
    project_id: UUID, session: DbSession, user: CurrentUser
) -> list[TaskBoardRow]:
    await require_owned_project(session, project_id, user)
    tasks = await task_service.list_tasks(session, project_id=project_id)
    rows = []
    for task in tasks:
        blocked_by = await task_service.blocked_by(session, task)
        row = TaskBoardRow.model_validate(task)
        row.blocked_by = blocked_by
        rows.append(row)
    return rows
