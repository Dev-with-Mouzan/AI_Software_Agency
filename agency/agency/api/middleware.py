"""API middleware: rate limiting and hardening response headers.

The rate limiter is a lightweight in-memory sliding-window counter (no external
dependencies). It is primarily a defense-in-depth guard for unauthenticated /
public endpoints; authenticated clients are already token-gated.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

RATE_LIMIT_WINDOW = 60.0
RATE_LIMIT_MAX = 600  # requests per window per client

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-XSS-Protection": "0",  # XSS filter is harmful; rely on a real CSP instead
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any):
        response = await call_next(request)
        for key, value in SECURITY_HEADERS.items():
            response.headers.setdefault(key, value)
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter keyed by client IP."""

    def __init__(
        self, app: Any, *, max_requests: int = RATE_LIMIT_MAX, window: float = RATE_LIMIT_WINDOW
    ) -> None:
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, now: float) -> None:
        cutoff = now - self.window
        for key in list(self._hits):
            dq = self._hits[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            if not dq:
                del self._hits[key]

    async def dispatch(self, request: Request, call_next: Any):
        # Health checks and metrics are exempt so probes/CI never trip the guard.
        if request.url.path.startswith(("/api/health", "/metrics", "/health")):
            return await call_next(request)

        now = time.monotonic()
        client_ip = request.client.host if request.client else "unknown"
        key = f"{client_ip}:{request.method}"
        self._prune(now)
        dq = self._hits[key]
        if len(dq) >= self.max_requests:
            return JSONResponse(
                {"detail": "rate limit exceeded, slow down"},
                status_code=429,
                headers={"Retry-After": str(int(self.window))},
            )
        dq.append(now)
        return await call_next(request)
