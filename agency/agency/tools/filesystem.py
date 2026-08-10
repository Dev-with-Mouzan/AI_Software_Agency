"""Filesystem tools with strict permission enforcement per agent workspace."""

from __future__ import annotations

import json
from typing import Any

from agency.tools.base import Tool, ToolContext, ToolResult
from agency.tools.shell import redact

MAX_READ_CHARS = 200_000


def _project_root(ctx: ToolContext):
    root = ctx.policy.project_root
    if root is None:
        raise RuntimeError("no project context; cannot resolve paths")
    return root


class ReadFileTool(Tool):
    name = "read_file"
    description = "Read the contents of a file inside the current project."
    parameters = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Path relative to the project root"},
            "max_chars": {"type": "integer", "default": 20000},
        },
        "required": ["path"],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        path = str(kwargs.get("path", ""))
        max_chars = min(int(kwargs.get("max_chars", 20000)), MAX_READ_CHARS)
        decision = ctx.policy.check_path(ctx.agent_kind, path, mode="read")
        if not decision.allowed:
            return ToolResult(False, error=f"permission denied: {decision.reason}")

        try:
            target = _project_root(ctx) / path
        except RuntimeError as exc:
            return ToolResult(False, error=str(exc))
        if not target.is_file():
            return ToolResult(False, error=f"not a file: {path}")
        try:
            content = target.read_text(encoding="utf-8", errors="ignore")
        except OSError as exc:
            return ToolResult(False, error=str(exc))
        if len(content) > max_chars:
            content = content[:max_chars] + f"\n...[truncated {len(content) - max_chars} chars]"
        return ToolResult(True, output=redact(content), data={"path": path, "size": len(content)})


class WriteFileTool(Tool):
    name = "write_file"
    description = "Create or overwrite a file. Only allowed inside the agent's own workspace."
    parameters = {
        "type": "object",
        "properties": {
            "path": {"type": "string"},
            "content": {"type": "string"},
        },
        "required": ["path", "content"],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        path = str(kwargs.get("path", ""))
        content = str(kwargs.get("content", ""))
        decision = ctx.policy.check_path(ctx.agent_kind, path, mode="write")
        if not decision.allowed:
            return ToolResult(False, error=f"permission denied: {decision.reason}")

        try:
            target = _project_root(ctx) / path
        except RuntimeError as exc:
            return ToolResult(False, error=str(exc))
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            target.write_text(content, encoding="utf-8")
        except OSError as exc:
            return ToolResult(False, error=str(exc))
        return ToolResult(True, output=f"wrote {path} ({len(content)} bytes)", data={"path": path})


class ListDirTool(Tool):
    name = "list_dir"
    description = "List files and directories under a path in the project."
    parameters = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "default": "."},
        },
        "required": [],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        path = str(kwargs.get("path", ".") or ".")
        decision = ctx.policy.check_path(ctx.agent_kind, path, mode="read")
        if not decision.allowed:
            return ToolResult(False, error=f"permission denied: {decision.reason}")

        try:
            target = _project_root(ctx) / path
        except RuntimeError as exc:
            return ToolResult(False, error=str(exc))
        if not target.exists():
            return ToolResult(False, error=f"no such path: {path}")
        entries = []
        for p in sorted(target.iterdir()):
            entries.append({"name": p.name, "type": "dir" if p.is_dir() else "file"})
        return ToolResult(
            True,
            output=json.dumps(entries, indent=2),
            data={"path": path, "entries": entries},
        )


class MakeDirTool(Tool):
    name = "make_dir"
    description = "Create a directory inside the project (write scope required)."
    parameters = {
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        path = str(kwargs.get("path", ""))
        decision = ctx.policy.check_path(ctx.agent_kind, path, mode="write")
        if not decision.allowed:
            return ToolResult(False, error=f"permission denied: {decision.reason}")
        try:
            (_project_root(ctx) / path).mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            return ToolResult(False, error=str(exc))
        return ToolResult(True, output=f"created directory {path}")


class DeleteFileTool(Tool):
    name = "delete_file"
    description = "Delete a file inside the agent's own workspace. Use with care."
    parameters = {
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        path = str(kwargs.get("path", ""))
        decision = ctx.policy.check_path(ctx.agent_kind, path, mode="write")
        if not decision.allowed:
            return ToolResult(False, error=f"permission denied: {decision.reason}")
        try:
            target = _project_root(ctx) / path
        except RuntimeError as exc:
            return ToolResult(False, error=str(exc))
        if target.is_file():
            target.unlink()
            return ToolResult(True, output=f"deleted {path}")
        return ToolResult(False, error=f"not a file: {path}")
