"""Web research tools: let the Planner search the internet and read pages.

Both tools are import-safe — the optional `duckduckgo-search` package is
loaded lazily and failures surface as clear tool errors instead of crashing
the agent loop.

`web_fetch` is SSRF-hardened: private, loopback, link-local and reserved
addresses are refused (both on the requested URL and on every redirect hop)
so the agent can never be used as a proxy into the internal network or the
cloud metadata service.
"""

from __future__ import annotations

import ipaddress
import json
import re
import socket
from typing import Any
from urllib.parse import urlparse

import httpx

from agency.tools.base import Tool, ToolContext, ToolResult

_DDGS_ERROR = (
    "The 'duckduckgo-search' package is not installed. Install it with: uv add duckduckgo-search"
)

_MAX_REDIRECTS = 5


def _is_private_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def _blocked_url_reason(url: str) -> str | None:
    """Return a reason string if the URL points at a blocked address, else None.

    Hostnames are resolved so `http://localhost`, `http://169.254.169.254` and
    DNS names that resolve to internal addresses are all caught.
    """
    try:
        parsed = urlparse(url)
    except ValueError:
        return "malformed url"
    host = parsed.hostname
    if not host:
        return "url has no host"
    try:
        addrinfo = socket.getaddrinfo(host, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return f"cannot resolve host: {host}"
    for _, _, _, _, sockaddr in addrinfo:
        ip = sockaddr[0]
        if not isinstance(ip, str):
            continue
        if _is_private_ip(ip):
            return f"blocked address (SSRF): {host} resolves to {ip}"
    return None


async def _safe_get(client: httpx.AsyncClient, url: str, headers: dict[str, str]) -> httpx.Response:
    """GET url, re-checking SSRF policy on every redirect hop."""
    current = url
    for _ in range(_MAX_REDIRECTS + 1):
        reason = _blocked_url_reason(current)
        if reason:
            raise httpx.RequestError(reason, request=httpx.Request("GET", current))
        resp = await client.get(current, headers=headers, follow_redirects=False)
        if resp.status_code in (301, 302, 303, 307, 308) and resp.headers.get("location"):
            current = str(httpx.URL(current).join(resp.headers["location"]))
            continue
        return resp
    raise httpx.RequestError(
        f"too many redirects (>{_MAX_REDIRECTS})", request=httpx.Request("GET", current)
    )


def _ddgs_text(query: str, max_results: int) -> list[dict[str, str]]:
    """Run a DuckDuckGo text search, tolerating both import paths."""
    try:
        from ddgs import DDGS  # duckduckgo-search >= 7
    except ImportError:
        try:
            from duckduckgo_search import DDGS  # type: ignore[no-redef]  # duckduckgo-search 6.x
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(_DDGS_ERROR) from exc
    with DDGS() as ddgs:
        results = ddgs.text(query, max_results=max_results)
    return [
        {
            "title": str(r.get("title", "")),
            "url": str(r.get("href") or r.get("url") or ""),
            "body": str(r.get("body", "")),
        }
        for r in results
        if r.get("title") or r.get("body")
    ]


class WebSearchTool(Tool):
    name = "web_search"
    description = (
        "Search the live web with DuckDuckGo. Returns ranked results with titles, "
        "URLs and snippets. Use this to research an idea, find best practices, "
        "libraries, pricing or how similar products actually work before planning."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query"},
            "max_results": {"type": "integer", "default": 8},
        },
        "required": ["query"],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        query = str(kwargs.get("query", "")).strip()
        max_results = int(kwargs.get("max_results", 8))
        if not query:
            return ToolResult(False, error="query is required")
        try:
            results = _ddgs_text(query, max_results)
        except RuntimeError as exc:
            return ToolResult(False, error=str(exc))
        except Exception as exc:
            return ToolResult(False, error=f"web search failed: {exc}")
        if not results:
            return ToolResult(False, error=f"no results found for: {query}")
        return ToolResult(
            True,
            output=json.dumps(results, indent=2, ensure_ascii=False),
            data={"query": query, "results": results},
        )


class WebFetchTool(Tool):
    name = "web_fetch"
    description = (
        "Fetch a web page (from a search result or a known URL) and return its "
        "readable text content. Use this to read documentation, blog posts and "
        "references in full detail."
    )
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "The full URL to fetch"},
            "max_chars": {"type": "integer", "default": 12000},
        },
        "required": ["url"],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        url = str(kwargs.get("url", "")).strip()
        max_chars = int(kwargs.get("max_chars", 12000))
        if not url.startswith(("http://", "https://")):
            return ToolResult(False, error="url must start with http:// or https://")
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml",
        }
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await _safe_get(client, url, headers)
                resp.raise_for_status()
        except Exception as exc:
            return ToolResult(False, error=f"failed to fetch {url}: {exc}")

        text = _html_to_text(resp.text)
        if not text.strip():
            return ToolResult(False, error=f"no readable content at {url}")
        if len(text) > max_chars:
            text = text[:max_chars] + "\n...[truncated]"
        return ToolResult(True, output=text, data={"url": url, "chars": len(text)})


def _html_to_text(html: str) -> str:
    # Strip scripts/styles, then tags, then collapse blank lines.
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?s)<!--.*?-->", " ", html)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
