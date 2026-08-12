"""Tool tests: run_command executes real subprocesses on any event loop."""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

import pytest

from agency.tools.base import ToolContext, ToolResult
from agency.tools.shell import RunCommandTool


@pytest.fixture
def tool_ctx() -> ToolContext:
    root = Path(tempfile.mkdtemp(prefix="shell_test_"))
    return ToolContext(
        agent_kind="backend_engineer",
        agent_name="Backend Engineer",
        project_root=root,
        workspace_root=root,
    )


async def test_run_command_executes_and_returns_output(tool_ctx) -> None:
    result = await RunCommandTool().run(tool_ctx, command="echo hello world")
    assert result.success is True
    assert "hello world" in result.output
    assert result.data["exit_code"] == 0


async def test_run_command_reports_nonzero_exit_with_detail(tool_ctx) -> None:
    result = await RunCommandTool().run(tool_ctx, command="exit 3")
    assert result.success is False
    assert "command exited with code 3" in result.error


async def test_run_command_rejects_chaining(tool_ctx) -> None:
    result = await RunCommandTool().run(tool_ctx, command="echo a && echo b")
    assert result.success is False
    assert "rejected" in result.error


def _run_on_selector(tool_ctx: ToolContext) -> ToolResult:
    """Execute the tool inside a SelectorEventLoop in a worker thread."""
    loop = asyncio.SelectorEventLoop()
    try:
        return loop.run_until_complete(
            RunCommandTool().run(tool_ctx, command="echo selector-ok")
        )
    finally:
        loop.close()


async def test_run_command_works_on_selector_style_loops(tool_ctx) -> None:
    """Regression: asyncio subprocess raises NotImplementedError on loops that
    cannot spawn subprocesses (e.g. SelectorEventLoop on Windows). run_command
    must work regardless of the event-loop type."""
    result = await asyncio.to_thread(_run_on_selector, tool_ctx)
    assert result.success is True
    assert "selector-ok" in result.output
