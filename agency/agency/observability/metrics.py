"""Prometheus metrics."""

from __future__ import annotations

import time

from prometheus_client import Counter, Gauge, Histogram
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

AGENT_RUNS = Counter("agency_agent_runs_total", "Agent runs", ["agent_kind", "outcome"])
AGENT_TOOL_CALLS = Counter(
    "agency_agent_tool_calls_total", "Agent tool calls", ["agent_kind", "tool", "outcome"]
)
TASK_TRANSITIONS = Counter(
    "agency_task_transitions_total", "Task status transitions", ["from", "to"]
)
TASK_DURATION = Histogram(
    "agency_task_duration_seconds", "Time to complete a task", buckets=[60, 300, 900, 3600, 14400]
)
WORKFLOW_RUNS = Counter("agency_workflow_runs_total", "Workflow runs", ["kind", "outcome"])
LLM_CALLS = Counter("agency_llm_calls_total", "LLM calls", ["provider", "model"])
LLM_LATENCY = Histogram("agency_llm_latency_seconds", "LLM call latency", ["provider"])
AGENT_STATUS = Gauge("agency_agent_status", "Agent status (1=running)", ["agent_kind"])


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Times every HTTP request and exposes /metrics via the app."""

    REQUEST_TIME = Histogram(
        "agency_http_request_duration_seconds", "HTTP request duration", ["method", "path"]
    )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        method = request.method
        start = time.perf_counter()
        try:
            response = await call_next(request)
            return response
        finally:
            self.REQUEST_TIME.labels(method=method, path=path).observe(time.perf_counter() - start)
