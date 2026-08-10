"""Task lifecycle service: creation, assignment, transitions, dependencies."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from agency.core.enums import ReviewStatus, TaskStatus
from agency.db.models import Task, TaskComment
from agency.observability.metrics import TASK_DURATION, TASK_TRANSITIONS
from agency.permissions.audit import record as audit_record

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    TaskStatus.TODO.value: {
        TaskStatus.IN_PROGRESS.value,
        TaskStatus.BLOCKED.value,
        TaskStatus.CANCELLED.value,
    },
    TaskStatus.IN_PROGRESS.value: {
        TaskStatus.REVIEW.value,
        TaskStatus.BLOCKED.value,
        TaskStatus.DONE.value,
        TaskStatus.CANCELLED.value,
    },
    TaskStatus.BLOCKED.value: {
        TaskStatus.TODO.value,
        TaskStatus.IN_PROGRESS.value,
        TaskStatus.CANCELLED.value,
    },
    TaskStatus.REVIEW.value: {
        TaskStatus.DONE.value,
        TaskStatus.IN_PROGRESS.value,
        TaskStatus.BLOCKED.value,
    },
    TaskStatus.DONE.value: {TaskStatus.IN_PROGRESS.value, TaskStatus.REVIEW.value},
    TaskStatus.CANCELLED.value: set(),
}


class TaskService:
    @staticmethod
    async def create(
        session: AsyncSession,
        *,
        project_id: UUID,
        title: str,
        description: str = "",
        priority: str = "MEDIUM",
        milestone_id: UUID | None = None,
        owner: str | None = None,
        dependencies: list[str] | None = None,
        files_affected: list[str] | None = None,
        estimated_points: int = 1,
        actor: str = "system",
    ) -> Task:
        task = Task(
            project_id=project_id,
            title=title,
            description=description,
            priority=priority,
            milestone_id=milestone_id,
            owner=owner,
            dependencies=dependencies or [],
            files_affected=files_affected or [],
            estimated_points=estimated_points,
            status=TaskStatus.TODO.value,
            review_status=ReviewStatus.PENDING.value,
        )
        session.add(task)
        await session.flush()
        await audit_record(
            session,
            actor=actor,
            action="create",
            resource_type="task",
            resource_id=str(task.id),
            detail={"title": title, "owner": owner, "priority": priority},
        )
        return task

    @staticmethod
    async def get(session: AsyncSession, task_id: UUID) -> Task | None:
        return await session.scalar(
            select(Task).options(selectinload(Task.comments)).where(Task.id == task_id)
        )

    @staticmethod
    async def list_tasks(
        session: AsyncSession,
        *,
        project_id: UUID | None = None,
        status: str | None = None,
        owner: str | None = None,
        milestone_id: UUID | None = None,
        limit: int = 500,
    ) -> list[Task]:
        stmt = (
            select(Task)
            .options(selectinload(Task.comments))
            .order_by(Task.created_at.desc())
            .limit(limit)
        )
        if project_id:
            stmt = stmt.where(Task.project_id == project_id)
        if status:
            stmt = stmt.where(Task.status == status)
        if owner:
            stmt = stmt.where(Task.owner == owner)
        if milestone_id:
            stmt = stmt.where(Task.milestone_id == milestone_id)
        return list((await session.scalars(stmt)).unique().all())

    @staticmethod
    async def update(
        session: AsyncSession,
        task_id: UUID,
        *,
        fields: dict[str, Any],
        actor: str = "system",
        skip_transition_validation: bool = False,
    ) -> Task | None:
        task = await session.get(Task, task_id, options=[selectinload(Task.comments)])
        if task is None:
            return None

        new_status = fields.get("status")
        if new_status and new_status != task.status and not skip_transition_validation:
            allowed = ALLOWED_TRANSITIONS.get(task.status, set())
            if new_status not in allowed:
                raise ValueError(
                    f"invalid transition {task.status} -> {new_status} (allowed: {sorted(allowed)})"
                )
            TASK_TRANSITIONS.labels(task.status, new_status).inc()

        old_status = task.status
        for key, value in fields.items():
            if hasattr(task, key) and value is not None:
                setattr(task, key, value)

        if old_status != TaskStatus.DONE.value and task.status == TaskStatus.DONE.value:
            started = task.created_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=UTC)
            TASK_DURATION.observe(max((datetime.now(UTC) - started).total_seconds(), 0.0))

        await audit_record(
            session,
            actor=actor,
            action="transition" if new_status else "update",
            resource_type="task",
            resource_id=str(task_id),
            detail={"fields": {k: str(v) for k, v in fields.items()}},
        )
        await session.flush()
        return task

    @staticmethod
    async def add_comment(
        session: AsyncSession, *, task_id: UUID, author: str, body: str
    ) -> TaskComment:
        comment = TaskComment(task_id=task_id, author=author, body=body)
        session.add(comment)
        await session.flush()
        return comment

    @staticmethod
    async def blocked_by(session: AsyncSession, task: Task) -> list[str]:
        """Return dependency ids that are not yet DONE."""
        deps = [d for d in (task.dependencies or []) if d]
        if not deps:
            return []
        dep_tasks = list(
            (
                await session.scalars(
                    select(Task).where(Task.id.in_([UUID(d) for d in deps if _is_uuid(d)]))
                )
            ).all()
        )
        return [str(dt.id) for dt in dep_tasks if dt.status != TaskStatus.DONE.value]

    @staticmethod
    async def stats(session: AsyncSession, project_id: UUID) -> dict[str, int]:
        rows = (
            await session.execute(
                select(Task.status, func.count(Task.id))
                .where(Task.project_id == project_id)
                .group_by(Task.status)
            )
        ).all()
        counts: dict[str, int] = {s.value: 0 for s in TaskStatus}
        for status, count in rows:
            counts[status] = int(count)
        return counts


def _is_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except ValueError:
        return False


task_service = TaskService()
