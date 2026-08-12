"""Common schema helpers."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
