"""Calculator API — FastAPI backend.

Endpoints
---------
GET  /health              -> liveness check
GET  /api/operations      -> list supported operations / functions
POST /api/calculate       -> evaluate a math expression
GET  /api/history         -> recent calculations (newest first)
DELETE /api/history       -> clear calculation history
"""

from __future__ import annotations

import os
from collections import deque
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from .calculator import ALLOWED_FUNCTIONS, CalculationError, evaluate
from .models import (
    CalculateRequest,
    CalculateResponse,
    CalculationErrorResponse,
    HealthResponse,
    HistoryEntry,
    HistoryResponse,
)

app = FastAPI(
    title="Calculator API",
    description="Safe arithmetic expression evaluator.",
    version="1.0.0",
)

# --- CORS -------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- In-memory history store ------------------------------------------------
_MAX_HISTORY = int(os.environ.get("CALC_HISTORY_LIMIT", "100"))
_history: deque[HistoryEntry] = deque(maxlen=_MAX_HISTORY)


def _record(expression: str, result: float | int) -> HistoryEntry:
    entry = HistoryEntry(
        expression=expression,
        result=result,
        timestamp=datetime.now(timezone.utc),
    )
    _history.appendleft(entry)
    return entry


# --- Routes -----------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse()


@app.get("/api/operations", tags=["calculator"])
def list_operations() -> dict:
    """Return the supported operators and whitelisted math functions."""
    return {
        "operators": ["+", "-", "*", "/", "//", "%", "**", "unary +", "unary -"],
        "parentheses": True,
        "functions": sorted(ALLOWED_FUNCTIONS),
        "example": "sqrt(2) + 3 * (4 - 1)",
    }


@app.post(
    "/api/calculate",
    response_model=CalculateResponse,
    responses={400: {"model": CalculationErrorResponse}},
    tags=["calculator"],
)
def calculate(
    payload: CalculateRequest,
    # Allow GET-style query fallback: /api/calculate?expression=2%2B2
    expression: str | None = Query(default=None, max_length=256),
) -> CalculateResponse:
    expr = payload.expression if payload.expression is not None else expression
    if expr is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'expression' is required (body or query parameter)",
        )
    try:
        result = evaluate(expr)
    except CalculationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from None

    _record(expr, result)
    return CalculateResponse(expression=expr, result=result)


@app.get("/api/history", response_model=HistoryResponse, tags=["history"])
def history(
    limit: int = Query(default=20, ge=1, le=_MAX_HISTORY),
) -> HistoryResponse:
    entries = list(_history)[:limit]
    return HistoryResponse(entries=entries, total=len(_history))


@app.delete("/api/history", status_code=status.HTTP_204_NO_CONTENT, tags=["history"])
def clear_history() -> None:
    _history.clear()
