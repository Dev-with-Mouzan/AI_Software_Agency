"""SQLAlchemy ORM models for DevPilot AI.

Persistence for projects, milestones, tasks, agents, memory, knowledge,
workflows, deployments, audit log and notifications.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from agency.core.enums import (
    AgentStatus,
    AuditAction,
    DeploymentStatus,
    MemoryKind,
    Priority,
    ReviewStatus,
    StepStatus,
    TaskStatus,
    WorkflowStatus,
)
from agency.db.base import Base, UTCDateTime, UUIDPkMixin


class Project(UUIDPkMixin, Base):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(40), default="PLANNING")
    root_dir: Mapped[str] = mapped_column(String(500), default="")
    workspace_mode: Mapped[str] = mapped_column(
        String(20), default="structured"
    )  # structured (subfolders) | free (whole repo)

    milestones: Mapped[list[Milestone]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="Milestone.order_index",
        lazy="selectin",
    )
    tasks: Mapped[list[Task]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="selectin"
    )
    workflows: Mapped[list[WorkflowRun]] = relationship(back_populates="project", lazy="selectin")


class Milestone(UUIDPkMixin, Base):
    __tablename__ = "milestones"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(40), default="TODO")
    target_date: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    project: Mapped[Project] = relationship(back_populates="milestones", lazy="joined")
    tasks: Mapped[list[Task]] = relationship(back_populates="milestone", lazy="selectin")


class Task(UUIDPkMixin, Base):
    __tablename__ = "tasks"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("milestones.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(20), default=Priority.MEDIUM.value)
    status: Mapped[str] = mapped_column(String(30), default=TaskStatus.TODO.value, index=True)
    owner: Mapped[str] = mapped_column(String(50), nullable=True, index=True)  # agent kind
    dependencies: Mapped[list] = mapped_column(JSON, default=list)  # list of task ids
    files_affected: Mapped[list] = mapped_column(JSON, default=list)
    review_status: Mapped[str] = mapped_column(String(30), default=ReviewStatus.PENDING.value)
    estimated_points: Mapped[int] = mapped_column(Integer, default=1)

    project: Mapped[Project] = relationship(back_populates="tasks", lazy="joined")
    milestone: Mapped[Milestone | None] = relationship(back_populates="tasks", lazy="joined")
    comments: Mapped[list[TaskComment]] = relationship(
        back_populates="task", cascade="all, delete-orphan", lazy="selectin"
    )


class TaskComment(UUIDPkMixin, Base):
    __tablename__ = "task_comments"

    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), index=True
    )
    author: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    task: Mapped[Task] = relationship(back_populates="comments")


class AgentRecord(UUIDPkMixin, Base):
    """A registered AI employee."""

    __tablename__ = "agents"

    kind: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(30), default=AgentStatus.IDLE.value)
    role_description: Mapped[str] = mapped_column(Text, default="")
    workspace: Mapped[str] = mapped_column(String(100), nullable=False)  # relative dir
    allowed_tools: Mapped[list] = mapped_column(JSON, default=list)
    capabilities: Mapped[list] = mapped_column(JSON, default=list)
    heartbeat: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class AgentMemory(UUIDPkMixin, Base):
    """Long-term persistent memory entry for an agent."""

    __tablename__ = "agent_memory"

    agent_kind: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(40), default=MemoryKind.CONVERSATION.value)
    scope_type: Mapped[str] = mapped_column(String(30), default="")  # task | project | conversation
    scope_id: Mapped[str] = mapped_column(String(80), default="", index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(String(500), default="")
    importance: Mapped[float] = mapped_column(Float, default=0.5)
    embedding: Mapped[list | None] = mapped_column(JSON, nullable=True)


class KnowledgeChunk(UUIDPkMixin, Base):
    """Chunked, indexed source material for the RAG knowledge base."""

    __tablename__ = "knowledge_chunks"

    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    source: Mapped[str] = mapped_column(String(1000), default="")  # file path / url
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    embedding: Mapped[list | None] = mapped_column(JSON, nullable=True)


class WorkflowRun(UUIDPkMixin, Base):
    __tablename__ = "workflow_runs"

    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(
        String(60), nullable=False
    )  # build_project | code_review | deploy
    status: Mapped[str] = mapped_column(String(30), default=WorkflowStatus.PENDING.value)
    current_step: Mapped[str] = mapped_column(String(100), default="")
    context: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    project: Mapped[Project | None] = relationship(back_populates="workflows", lazy="joined")
    steps: Mapped[list[WorkflowStep]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="WorkflowStep.order_index",
        lazy="selectin",
    )


class WorkflowStep(UUIDPkMixin, Base):
    __tablename__ = "workflow_steps"

    workflow_run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflow_runs.id", ondelete="CASCADE"), index=True
    )
    step_id: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    handler: Mapped[str] = mapped_column(String(60), default="")
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30), default=StepStatus.PENDING.value)
    agent_kind: Mapped[str | None] = mapped_column(String(50), nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    output: Mapped[dict] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    run: Mapped[WorkflowRun] = relationship(back_populates="steps", lazy="joined")


class Deployment(UUIDPkMixin, Base):
    __tablename__ = "deployments"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    environment: Mapped[str] = mapped_column(String(30), default="staging")
    status: Mapped[str] = mapped_column(String(30), default=DeploymentStatus.NOT_STARTED.value)
    version: Mapped[str] = mapped_column(String(100), default="0.0.0")
    checks: Mapped[dict] = mapped_column(JSON, default=dict)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[str] = mapped_column(String(100), default="")
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    deployed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    error: Mapped[str] = mapped_column(Text, default="")

    # Provider-based deployments (AWS / Vercel). Never stores credentials.
    provider: Mapped[str] = mapped_column(String(40), default="")
    deployment_url: Mapped[str] = mapped_column(Text, default="")
    project_url: Mapped[str] = mapped_column(Text, default="")
    deployment_id: Mapped[str] = mapped_column(String(200), default="")
    custom_domain: Mapped[str] = mapped_column(String(300), default="")
    domain_status: Mapped[str] = mapped_column(
        String(30), default="none"
    )  # none | pending_dns | verifying | active | failed
    dns_records: Mapped[dict] = mapped_column(JSON, default=dict)
    deployed_commit: Mapped[str] = mapped_column(String(100), default="")
    run_id: Mapped[str] = mapped_column(String(36), default="")
    logs: Mapped[list] = mapped_column(JSON, default=list)
    removed: Mapped[bool] = mapped_column(Boolean, default=False)


class AuditLog(UUIDPkMixin, Base):
    """Immutable trail of every agent and human action."""

    __tablename__ = "audit_log"

    actor: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    action: Mapped[str] = mapped_column(String(50), default=AuditAction.READ.value)
    resource_type: Mapped[str] = mapped_column(String(60), default="")
    resource_id: Mapped[str] = mapped_column(String(80), default="")
    allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class Notification(UUIDPkMixin, Base):
    __tablename__ = "notifications"

    recipient: Mapped[str] = mapped_column(String(100), default="human", index=True)
    kind: Mapped[str] = mapped_column(String(40), default="info")
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False)


class SettingsRecord(Base):
    """Singleton row (id=1) holding runtime LLM settings.

    Provider credentials + per-agent model routing configured from the Settings
    UI. Persisted as JSON so new fields never need a migration; the active copy
    is mirrored into an in-memory store (`agency/services/settings.py`) so the
    synchronous provider factory can read it without awaiting the database.
    """

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # always 1
    default_provider: Mapped[str] = mapped_column(String(40), default="")
    providers: Mapped[dict] = mapped_column(JSON, default=dict)
    agents: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
