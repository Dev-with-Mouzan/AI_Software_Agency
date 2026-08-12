"""Shared enum and constant definitions used across the domain layer."""

from __future__ import annotations

import enum


class TaskStatus(str, enum.Enum):
    """Lifecycle states for a task."""

    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    BLOCKED = "BLOCKED"
    REVIEW = "REVIEW"
    DONE = "DONE"
    CANCELLED = "CANCELLED"


class Priority(str, enum.Enum):
    MEDIUM = "MEDIUM"


class ReviewStatus(str, enum.Enum):
    """Code review pipeline states."""

    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class AgentStatus(str, enum.Enum):
    """Runtime status of an agent worker."""

    IDLE = "IDLE"
    RUNNING = "RUNNING"
    WAITING_HUMAN = "WAITING_HUMAN"
    BLOCKED = "BLOCKED"
    ERROR = "ERROR"


class WorkflowStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    WAITING_HUMAN = "WAITING_HUMAN"
    BLOCKED = "BLOCKED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    REVIEW_FAILED = "REVIEW_FAILED"


class StepStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    WAITING_HUMAN = "WAITING_HUMAN"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class DeploymentStatus(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    CHECKS_PENDING = "CHECKS_PENDING"
    READY_FOR_APPROVAL = "READY_FOR_APPROVAL"
    APPROVED = "APPROVED"
    DEPLOYING = "DEPLOYING"
    DEPLOYED = "DEPLOYED"
    FAILED = "FAILED"
    REJECTED = "REJECTED"
    REMOVED = "REMOVED"


class MemoryKind(str, enum.Enum):
    """Categories of persistent agent memory."""

    CONVERSATION = "CONVERSATION"
    TASK = "TASK"
    PROJECT = "PROJECT"
    DECISION = "DECISION"
    ARCHITECTURE = "ARCHITECTURE"
    LESSON = "LESSON"


class AuditAction(str, enum.Enum):
    READ = "read"


# Mapping of agent kind -> allowed workspace directory (relative to project root).
# This is the backbone of the permission system for structured projects.
WORKSPACE_MAP: dict[str, str] = {
    "planner": "docs",
    "backend_engineer": "backend",
    "frontend_engineer": "frontend",
    "devops_engineer": "deployment",
    "code_reviewer": "docs",
}
