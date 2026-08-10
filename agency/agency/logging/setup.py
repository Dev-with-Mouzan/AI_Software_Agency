"""Structured logging via structlog with JSON output in production."""

from __future__ import annotations

import logging
import sys

import structlog

from agency.config import get_settings


def configure_logging() -> None:
    settings = get_settings()

    if settings.environment == "production":
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer(ensure_ascii=False)
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty())

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]

    structlog.configure(
        processors=[*shared_processors, structlog.processors.format_exc_info, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(settings.log_level.upper())
        ),
        cache_logger_on_first_use=True,
    )

    # Route stdlib logging through structlog so uvicorn/sqlalchemy are captured too.
    logging.basicConfig(format="%(message)s", level=settings.log_level.upper())
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str = "agency") -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
