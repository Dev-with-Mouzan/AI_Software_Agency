"""Shell execution tool. Commands run inside the project workspace only."""

from __future__ import annotations

import asyncio
import subprocess
import sys
from typing import Any

from agency.tools.base import Tool, ToolContext, ToolResult

MAX_TIMEOUT = 300
MAX_OUTPUT = 20000


class RunCommandTool(Tool):
    name = "run_command"
    description = (
        "Run a shell command inside the project workspace (e.g. tests, linters, builds, "
        "git status). Output is captured and returned. Never run destructive commands."
    )
    parameters = {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "The command line to execute"},
            "timeout_seconds": {"type": "integer", "default": 120},
        },
        "required": ["command"],
    }

    async def run(self, ctx: ToolContext, **kwargs: Any) -> ToolResult:
        command = str(kwargs.get("command", ""))
        timeout = min(int(kwargs.get("timeout_seconds", 120)), MAX_TIMEOUT)

        decision = ctx.policy.check_command(ctx.agent_kind, command)
        if not decision.allowed:
            return ToolResult(False, error=f"command rejected: {decision.reason}")

        cwd = ctx.policy.project_root or ctx.workspace_root
        if cwd is None:
            return ToolResult(False, error="no workspace context for command execution")
        if not cwd.exists():
            return ToolResult(False, error=f"workspace does not exist: {cwd}")

        # Run the subprocess in a worker thread so command execution does not
        # depend on the event-loop transport (which raises NotImplementedError
        # on Windows when the loop is not a proactor loop).
        try:
            completed = await asyncio.to_thread(
                subprocess.run,
                command,
                cwd=str(cwd),
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return ToolResult(False, error=f"command timed out after {timeout}s")
        except Exception as exc:
            detail = str(exc).strip() or f"{type(exc).__name__} spawning the command"
            return ToolResult(False, error=f"failed to run command: {detail}")

        output = completed.stdout.decode("utf-8", errors="replace") if completed.stdout else ""
        output = redact(output)
        if len(output) > MAX_OUTPUT:
            output = output[:MAX_OUTPUT] + "\n...[output truncated]"
        code = completed.returncode or 0
        data = {"exit_code": code, "command": command, "shell": sys.platform}
        if code == 0:
            return ToolResult(True, output=output, data=data)
        tail = "\n".join(output.splitlines()[-8:]) if output.strip() else ""
        error = f"command exited with code {code}"
        if tail:
            error += f": {tail[:2000]}"
        return ToolResult(False, output=output, error=error, data=data)


def redact(text: str) -> str:
    """Scrub known secrets (API tokens, key=value secrets) from tool output.

    Cheap string-level redaction so a command that happens to echo an env secret
    (e.g. `docker compose config` dumping resolved variables) cannot leak it
    back into the model context.
    """
    import os
    import re

    seen: set[str] = set()
    candidates = ["API_TOKEN", "AGENCY_API_TOKEN", "DEEPSEEK_API_KEY",
                  "QWEN_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
                  "DATABASE_URL"]
    for key in candidates:
        value = os.environ.get(key)
        if value and len(value) >= 8:
            seen.add(value)
    for value in seen:
        if value in text:
            text = text.replace(value, "[REDACTED]")
    text = re.sub(r"(?i)(api[_-]?key|token|secret)\s*[=:]\s*\S+", r"\1=[REDACTED]", text)
    return text
