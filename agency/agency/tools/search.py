"""Search + memory tools: let agents query the RAG knowledge base and their memory."""

from __future__ import annotations

import json
from typing import Any

from agency.tools.base import Tool, ToolContext, ToolResult


class KnowledgeSearchTool(Tool):
    name = "knowledge_search"
    description = (
        "Search the project knowledge base (docs, README, architecture, requirements) "
        "before answering or writing code. Returns ranked snippets."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "k": {"type": "integer", "default": 5},
        },
        "required": ["query"],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        query = str(kwargs.get("query", ""))
        k = int(kwargs.get("k", 5))
        if ctx.knowledge is None or ctx.session is None:
            return ToolResult(False, error="knowledge base not available in this context")
        results = await ctx.knowledge.search(ctx.session, query, project_id=ctx.project_id, k=k)
        return ToolResult(
            True,
            output=json.dumps(results, indent=2, ensure_ascii=False),
            data={"results": results},
        )


class MemoryReadTool(Tool):
    name = "memory_read"
    description = (
        "Recall relevant long-term memories (decisions, lessons, preferences, project knowledge)."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "k": {"type": "integer", "default": 5},
        },
        "required": ["query"],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        query = str(kwargs.get("query", ""))
        k = int(kwargs.get("k", 5))
        if ctx.memory is None or ctx.session is None:
            return ToolResult(False, error="memory not available")
        results = await ctx.memory.search(ctx.session, query, agent_kind=ctx.agent_kind, k=k)
        return ToolResult(
            True,
            output=json.dumps(results, indent=2, ensure_ascii=False),
            data={"results": results},
        )


class MemoryWriteTool(Tool):
    name = "memory_write"
    description = "Persist an important fact, decision, lesson or preference to long-term memory."
    parameters = {
        "type": "object",
        "properties": {
            "content": {"type": "string"},
            "kind": {
                "type": "string",
                "enum": [
                    "conversation",
                    "decision",
                    "architecture",
                    "lesson",
                    "preference",
                    "project",
                    "task",
                ],
            },
            "scope_type": {"type": "string", "default": ""},
            "scope_id": {"type": "string", "default": ""},
        },
        "required": ["content"],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        content = str(kwargs.get("content", ""))
        kind = str(kwargs.get("kind", "conversation"))
        scope_type = str(kwargs.get("scope_type", ""))
        scope_id = str(kwargs.get("scope_id", ""))
        if ctx.memory is None or ctx.session is None:
            return ToolResult(False, error="memory not available")
        entry = await ctx.memory.write(
            ctx.session,
            agent_kind=ctx.agent_kind,
            content=content,
            kind=kind,
            scope_type=scope_type or ("task" if ctx.task_id else "conversation"),
            scope_id=scope_id or (ctx.task_id or ""),
        )
        return ToolResult(True, output=f"memory saved ({entry.id})", data={"id": str(entry.id)})
