"""Task endpoints: CRUD, comments, board."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from agency.api.deps import DbSession
from agency.db.models import Task
from agency.schemas.task import (
    TaskBoardRow,
    TaskCommentIn,
    TaskCommentOut,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from agency.services.projects import project_service
from agency.services.tasks import task_service

router = APIRouter(tags=["tasks"])


@router.post("/projects/{project_id}/tasks", response_model=TaskOut, status_code=201)
async def create_task(project_id: UUID, payload: TaskCreate, session: DbSession) -> TaskOut:
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
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
    project_id: UUID | None = None,
    status: str | None = None,
    owner: str | None = None,
) -> list[TaskOut]:
    tasks = await task_service.list_tasks(
        session, project_id=project_id, status=status, owner=owner
    )
    return [TaskOut.model_validate(t) for t in tasks]


@router.get("/tasks/{task_id}", response_model=TaskOut)
async def get_task(task_id: UUID, session: DbSession) -> TaskOut:
    task = await task_service.get(session, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    return TaskOut.model_validate(task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: UUID, payload: TaskUpdate, session: DbSession) -> TaskOut:
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
async def add_comment(task_id: UUID, payload: TaskCommentIn, session: DbSession) -> TaskCommentOut:
    task = await task_service.get(session, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    comment = await task_service.add_comment(
        session, task_id=task_id, author=payload.author, body=payload.body
    )
    await session.commit()
    return TaskCommentOut.model_validate(comment)


@router.get("/projects/{project_id}/board", response_model=list[TaskBoardRow])
async def task_board(project_id: UUID, session: DbSession) -> list[TaskBoardRow]:
    project = await project_service.get(session, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    tasks = await task_service.list_tasks(session, project_id=project_id)
    rows = []
    for task in tasks:
        blocked_by = await task_service.blocked_by(session, task)
        row = TaskBoardRow.model_validate(task)
        row.blocked_by = blocked_by
        rows.append(row)
    return rows
