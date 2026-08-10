"""Task service tests: lifecycle, transitions, dependencies, comments."""

from __future__ import annotations

import pytest

from agency.services.tasks import task_service


async def test_create_and_fetch(project, db) -> None:
    task = await task_service.create(
        db,
        project_id=project.id,
        title="Build auth",
        description="JWT + OAuth2",
        owner="backend_engineer",
    )
    await db.commit()
    fetched = await task_service.get(db, task.id)
    assert fetched is not None
    assert fetched.status == "TODO"
    assert fetched.owner == "backend_engineer"


async def test_transition_validation(project, db) -> None:
    task = await task_service.create(db, project_id=project.id, title="t")
    await db.commit()
    await task_service.update(db, task.id, fields={"status": "IN_PROGRESS"})
    await task_service.update(db, task.id, fields={"status": "REVIEW"})
    await task_service.update(db, task.id, fields={"status": "DONE"})
    await db.commit()
    fetched = await task_service.get(db, task.id)
    assert fetched is not None
    assert fetched.status == "DONE"


async def test_invalid_transition_raises(project, db) -> None:
    task = await task_service.create(db, project_id=project.id, title="t")
    await db.commit()
    with pytest.raises(ValueError):
        await task_service.update(db, task.id, fields={"status": "DONE"})


async def test_dependencies_block(project, db) -> None:
    dep = await task_service.create(db, project_id=project.id, title="dep")
    task = await task_service.create(
        db, project_id=project.id, title="depends", dependencies=[str(dep.id)]
    )
    await db.commit()
    blocked = await task_service.blocked_by(db, task)
    assert str(dep.id) in blocked
    await task_service.update(db, dep.id, fields={"status": "IN_PROGRESS"})
    await task_service.update(db, dep.id, fields={"status": "DONE"})
    await db.commit()
    refreshed = await task_service.get(db, task.id)
    assert refreshed is not None
    assert await task_service.blocked_by(db, refreshed) == []


async def test_comments(project, db) -> None:
    task = await task_service.create(db, project_id=project.id, title="t")
    await db.commit()
    comment = await task_service.add_comment(
        db, task_id=task.id, author="backend_engineer", body="looks good"
    )
    assert comment.author == "backend_engineer"
    await db.commit()
    fetched = await task_service.get(db, task.id)
    assert fetched is not None
    assert any(c.author == "backend_engineer" for c in fetched.comments)


async def test_stats(project, db) -> None:
    await task_service.create(db, project_id=project.id, title="a")
    b = await task_service.create(db, project_id=project.id, title="b")
    await task_service.update(db, b.id, fields={"status": "IN_PROGRESS"})
    await task_service.update(db, b.id, fields={"status": "DONE"})
    await db.commit()
    stats = await task_service.stats(db, project.id)
    assert stats["TODO"] == 1
    assert stats["DONE"] == 1
