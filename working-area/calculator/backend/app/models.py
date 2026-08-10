"""Pydantic models (schemas) for the calculator API."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Union

from pydantic import BaseModel, Field, field_validator

Number = Union[int, float]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CalculateRequest(BaseModel):
    """Body of ``POST /api/calculate``."""

    expression: str = Field(
        ...,
        min_length=1,
        max_length=256,
        description="Math expression to evaluate, e.g. '2 + 3 * 4'",
    )

    @field_validator("expression")
    @classmethod
    def strip_expression(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("expression must not be blank")
        return value


class CalculateResponse(BaseModel):
    """Successful result of ``POST /api/calculate``."""

    expression: str
    result: Number
    computed_at: datetime = Field(default_factory=_now)


class CalculationErrorResponse(BaseModel):
    """Error payload returned for an invalid/uncomputable expression."""

    detail: str
    expression: str | None = None


class HistoryEntry(BaseModel):
    """A single recorded calculation."""

    expression: str
    result: Number
    timestamp: datetime


class HistoryResponse(BaseModel):
    """Recent calculations, newest first."""

    entries: list[HistoryEntry]
    total: int


class HealthResponse(BaseModel):
    """Health check payload."""

    status: str = "ok"
    service: str = "calculator-api"
