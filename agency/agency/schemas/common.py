"""Common schema helpers."""

from __future__ import annotations

from datetime import datetime
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    """Base schema that can be serialized from SQLAlchemy models."""

    model_config = ConfigDict(from_attributes=True)


class HealthStatus(BaseModel):
    status: str
    version: str
    environment: str
    database: str
    uptime_seconds: float
    services: dict[str, str]
    timestamp: datetime


class ListResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int = 1
    page_size: int = 50


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)


class IDResponse(BaseModel):
    id: UUID
