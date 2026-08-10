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
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ReviewStatus(str, enum.Enum):
    """Code review pipeline states."""

    PENDING = "PENDING"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    CHANGES_REQUESTED = "CHANGES_REQUESTED"
    QA_APPROVED = "QA_APPROVED"
    REJECTED = "REJECTED"


class AgentStatus(str, enum.Enum):
    """Runtime status of an agent worker."""

    IDLE = "IDLE"
    RUNNING = "RUNNING"
    WAITING_HUMAN = "WAITING_HUMAN"
    BLOCKED = "BLOCKED"
    OFFLINE = "OFFLINE"
    ERROR = "ERROR"


class AgentKind(str, enum.Enum):
    PLANNER = "planner"
    BACKEND_ENGINEER = "backend_engineer"
    FRONTEND_ENGINEER = "frontend_engineer"
    DEVOPS_ENGINEER = "devops_engineer"
    CODE_REVIEWER = "code_reviewer"


class WorkflowStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    WAITING_HUMAN = "WAITING_HUMAN"
    BLOCKED = "BLOCKED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class StepStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    WAITING_HUMAN = "WAITING_HUMAN"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class DeploymentStatus(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    CHECKS_PENDING = "CHECKS_PENDING"
    READY_FOR_APPROVAL = "READY_FOR_APPROVAL"
    APPROVED = "APPROVED"
    DEPLOYING = "DEPLOYING"
    DEPLOYED = "DEPLOYED"
    FAILED = "FAILED"
    REJECTED = "REJECTED"


class MemoryKind(str, enum.Enum):
    """Categories of persistent agent memory."""

    CONVERSATION = "CONVERSATION"
    TASK = "TASK"
    PROJECT = "PROJECT"
    DECISION = "DECISION"
    ARCHITECTURE = "ARCHITECTURE"
    PREFERENCE = "PREFERENCE"
    LESSON = "LESSON"


class MessageRole(str, enum.Enum):
    HUMAN = "human"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class AuditAction(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    READ = "read"
    DELETE = "delete"
    RUN_TOOL = "run_tool"
    APPROVE = "approve"
    REJECT = "reject"
    ASSIGN = "assign"
    TRANSITION = "transition"
    PERMISSION_DENIED = "permission_denied"


# Mapping of agent kind -> allowed workspace directory (relative to project root).
# This is the backbone of the permission system for structured projects.
WORKSPACE_MAP: dict[str, str] = {
    "planner": "docs",
    "backend_engineer": "backend",
    "frontend_engineer": "frontend",
    "devops_engineer": "deployment",
    "code_reviewer": "docs",
}
