"""Central registry of every tool available to agents."""

from __future__ import annotations

from agency.tools.base import Tool
from agency.tools.filesystem import (
    DeleteFileTool,
    ListDirTool,
    MakeDirTool,
    ReadFileTool,
    WriteFileTool,
)
from agency.tools.search import KnowledgeSearchTool, MemoryReadTool, MemoryWriteTool
from agency.tools.shell import RunCommandTool
from agency.tools.web_search import WebFetchTool, WebSearchTool


def build_registry() -> dict[str, Tool]:
    tools: list[Tool] = [
        ReadFileTool(),
        WriteFileTool(),
        ListDirTool(),
        MakeDirTool(),
        DeleteFileTool(),
        RunCommandTool(),
        KnowledgeSearchTool(),
        MemoryReadTool(),
        MemoryWriteTool(),
        WebSearchTool(),
        WebFetchTool(),
    ]
    return {tool.name: tool for tool in tools}


_default_registry: dict[str, Tool] | None = None


def get_tool_registry() -> dict[str, Tool]:
    global _default_registry
    if _default_registry is None:
        _default_registry = build_registry()
    return _default_registry
