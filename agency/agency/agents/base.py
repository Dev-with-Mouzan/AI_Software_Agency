"""BaseAgent — the runtime loop shared by every AI employee.

The loop:
  1. Assembles a system prompt (role, boundaries, tools, task context).
  2. Recalls short-term + long-term memory and knowledge-base context.
  3. Calls the LLM; executes any requested tools with permission checks.
  4. Iterates until the model produces a final text answer or the round cap.
  5. Persists short-term memory and important long-term memories.

Tool calls are exchanged via a structured JSON protocol that works across
every LLM provider (OpenAI, Anthropic, Gemini and the offline null provider).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.config import get_settings
from agency.core.enums import AgentStatus, MemoryKind
from agency.db.models import AgentRecord, Project, Task
from agency.knowledge.index import KnowledgeBase
from agency.llm.provider import BaseLLMProvider, LLMResponse, ToolCall, ToolSchema
from agency.memory.manager import MemoryManager
from agency.observability.metrics import (
    AGENT_RUNS,
    AGENT_STATUS,
    AGENT_TOOL_CALLS,
)
from agency.permissions.audit import record as audit_record
from agency.permissions.policy import PermissionPolicy
from agency.tools.base import Tool, ToolContext, ToolResult


@dataclass
class AgentRunContext:
    session: AsyncSession
    project: Project | None = None
    task: Task | None = None
    user_message: str = ""
    instructions: str = ""
    workflow_run_id: UUID | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentResult:
    reply: str = ""
    actions: list[dict[str, Any]] = field(default_factory=list)
    needs_human: bool = False
    stats: dict[str, Any] = field(default_factory=dict)
    memory_written: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "reply": self.reply,
            "actions": self.actions,
            "needs_human": self.needs_human,
            "stats": self.stats,
            "memory_written": self.memory_written,
        }


class BaseAgent:
    kind: str
    name: str
    title: str = ""
    description: str = ""
    capabilities: list[str] = []

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        from agency.agents.prompts import AGENT_PROFILES

        profile = AGENT_PROFILES.get(cls.kind)
        if profile:
            cls.name = profile["name"]
            cls.title = profile["title"]
            cls.description = profile["description"]
            cls.capabilities = list(profile["capabilities"])

    def __init__(
        self,
        llm: BaseLLMProvider,
        memory: MemoryManager | None = None,
        knowledge: KnowledgeBase | None = None,
        tool_registry: dict[str, Tool] | None = None,
    ) -> None:
        self.llm = llm
        self.memory = memory
        self.knowledge = knowledge
        self.tool_registry = tool_registry or {}
        self._max_rounds = get_settings().max_tool_rounds

    # --- identity -------------------------------------------------------
    @property
    def allowed_tool_names(self) -> list[str]:
        return sorted(
            name
            for name in self.tool_registry
            if PermissionPolicy().check_tool(self.kind, name).allowed
        )

    def tools(self) -> list[Tool]:
        return [self.tool_registry[name] for name in self.allowed_tool_names]

    # --- main loop ------------------------------------------------------
    async def run(self, ctx: AgentRunContext) -> AgentResult:
        AGENT_RUNS.labels(agent_kind=self.kind, outcome="started").inc()
        AGENT_STATUS.labels(agent_kind=self.kind).set(1)
        start = time()
        result = AgentResult()
        messages: list[dict[str, Any]] = []
        await self._mark_status(ctx, AgentStatus.RUNNING)

        try:
            # 1. Context retrieval
            memory_context = await self._recall_memory(ctx)
            knowledge_context = await self._search_knowledge(ctx)

            # 2. System prompt
            system_prompt = self._build_prompt(ctx, memory_context, knowledge_context)
            messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": ctx.user_message})

            # 3-5. Agent loop
            consecutive_failures = 0
            had_failures = False
            for _round in range(self._max_rounds):
                response = await self._chat(messages)
                assistant_msg: dict[str, Any] = {
                    "role": "assistant",
                    "content": response.text or "",
                }
                if response.tool_calls:
                    assistant_msg["tool_calls"] = [tc.model_dump() for tc in response.tool_calls]
                messages.append(assistant_msg)

                to_execute = self._pick_tool_calls(response)
                if not to_execute:
                    result.reply = response.text
                    break

                stopped = False
                for tool_call in to_execute:
                    tool_result = await self._execute_tool(ctx, tool_call.name, tool_call.arguments)
                    result.actions.append(
                        {
                            "tool": tool_call.name,
                            "arguments": tool_call.arguments,
                            "success": tool_result.success,
                        }
                    )
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "tool_name": tool_call.name,
                            "content": self._tool_result_text(tool_result),
                        }
                    )
                    if tool_result.success:
                        consecutive_failures = 0
                    else:
                        consecutive_failures += 1
                        had_failures = True
                        if consecutive_failures >= 2:
                            result.reply = (
                                f"Stopped after repeated tool failures: {tool_result.error}"
                            )
                            result.needs_human = True
                            stopped = True
                            break
                if stopped:
                    break
            else:
                result.reply = result.reply or (
                    "I reached my maximum tool round budget without finishing. "
                    "Please ask the human for guidance."
                )
                result.needs_human = True

            # 6. Memory: push short-term, summarize important content to long-term
            self._push_short_term(ctx, result, messages)
            result.memory_written = await self._consolidate_memory(ctx, result, messages)

            result.stats = {
                "agent": self.kind,
                "rounds_used": min(len(messages) // 2, self._max_rounds),
                "duration_ms": int((time() - start) * 1000),
                "llm": self.llm.name,
                "had_failures": had_failures,
            }
            result.needs_human = result.needs_human or _wants_human(result.reply)
            AGENT_RUNS.labels(agent_kind=self.kind, outcome="completed").inc()
            return result
        except Exception as exc:
            AGENT_RUNS.labels(agent_kind=self.kind, outcome="error").inc()
            result.reply = f"Error during execution: {exc}"
            result.needs_human = True
            result.stats["error"] = str(exc)
            await self._mark_status(ctx, AgentStatus.ERROR)
            return result
        finally:
            AGENT_STATUS.labels(agent_kind=self.kind).set(0)
            if result.reply and "Error" not in result.reply:
                await self._mark_status(ctx, AgentStatus.IDLE)

    # --- loop internals -------------------------------------------------
    async def _chat(self, messages: list[dict[str, Any]]) -> LLMResponse:
        settings = get_settings()
        return await self.llm.chat(
            messages,
            [ToolSchema(**t.schema()) for t in self.tools()],
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
        )

    def _pick_tool_calls(self, response: LLMResponse) -> list[ToolCall]:
        if response.tool_calls:
            return list(response.tool_calls)
        parsed = parse_tool_call(response.text)
        if parsed is None:
            return []
        name, args = parsed
        return [ToolCall(id=f"call_{name}", name=name, arguments=args)]

    async def _execute_tool(
        self, ctx: AgentRunContext, name: str, args: dict[str, Any]
    ) -> ToolResult:
        tool = self.tool_registry.get(name)
        if tool is None:
            return ToolResult(False, error=f"unknown tool: {name}")

        # Agents may only mutate the filesystem when bound to a concrete project.
        if ctx.project is None and name in _WRITE_TOOLS:
            return ToolResult(
                False,
                error=(
                    f"tool '{name}' requires a project context — select a project "
                    "before writing files"
                ),
            )

        policy = PermissionPolicy(
            project_root=ctx.project.root_dir if ctx.project else None,
            workspace_mode=ctx.project.workspace_mode if ctx.project else "structured",
        )
        decision = policy.check_tool(self.kind, name)
        if not decision.allowed:
            AGENT_TOOL_CALLS.labels(self.kind, name, "denied").inc()
            await audit_record(
                ctx.session,
                actor=self.kind,
                action="permission_denied",
                resource_type="tool",
                resource_id=name,
                allowed=False,
                detail={"args": args},
            )
            return ToolResult(False, error=decision.reason)

        tool_ctx = ToolContext(
            agent_kind=self.kind,
            agent_name=self.name,
            project_root=Path(ctx.project.root_dir) if ctx.project else None,
            project_id=ctx.project.id if ctx.project else None,
            task_id=str(ctx.task.id) if ctx.task else None,
            session=ctx.session,
            memory=self.memory,
            knowledge=self.knowledge,
            policy=policy,
            workspace_root=get_settings().agency_root,
        )
        try:
            await audit_record(
                ctx.session,
                actor=self.kind,
                action="run_tool",
                resource_type="tool",
                resource_id=name,
                allowed=True,
                detail={"args": args},
            )
            tool_result = await tool.run(tool_ctx, **args)
        except Exception as exc:
            tool_result = ToolResult(False, error=f"tool raised: {exc}")
        AGENT_TOOL_CALLS.labels(self.kind, name, "ok" if tool_result.success else "error").inc()
        return tool_result

    # --- prompt & retrieval --------------------------------------------
    async def _recall_memory(self, ctx: AgentRunContext) -> str:
        lines: list[str] = []
        if self.memory and ctx.session:
            try:
                # Isolate memory to the current project (and its current task) so
                # agents never inherit memories from a different project.
                scopes: list[tuple[str, str]] = []
                if ctx.project:
                    scopes.append(("project", str(ctx.project.id)))
                    if ctx.task:
                        scopes.append(("task", str(ctx.task.id)))
                        scopes.append(("conversation", str(ctx.task.id)))
                else:
                    scopes.append(("", ""))
                for scope_type, scope_id in scopes:
                    memories = await self.memory.search(
                        ctx.session,
                        ctx.user_message[:500],
                        agent_kind=self.kind,
                        scope_type=scope_type,
                        scope_id=scope_id,
                        k=4,
                    )
                    for m in memories:
                        lines.append(f"- [{m['kind']}] {m['content']}")
            except Exception:
                pass
        return "\n".join(lines) or "(no relevant memories)"

    async def _search_knowledge(self, ctx: AgentRunContext) -> str:
        if not self.knowledge or not ctx.session:
            return ""
        try:
            results = await self.knowledge.search(
                ctx.session,
                ctx.user_message[:500],
                project_id=ctx.project.id if ctx.project else None,
                k=3,
            )
            return "\n".join(f"[{r['title']}] {r['content'][:400]}" for r in results)
        except Exception:
            return ""

    def _build_prompt(
        self, ctx: AgentRunContext, memory_context: str, knowledge_context: str
    ) -> str:
        from agency.agents.prompts import build_system_prompt

        project_label = ctx.project.name if ctx.project else "not yet created"
        task_label = ctx.task.title if ctx.task else "none"
        task_status = ctx.task.status if ctx.task else "-"
        base = build_system_prompt(
            self.kind,
            tools=self.allowed_tool_names,
            project=project_label,
            task=task_label,
            task_status=task_status,
            instructions=ctx.instructions,
        )
        extras = []
        if memory_context:
            extras.append(f"## Relevant memories\n{memory_context}")
        if knowledge_context:
            extras.append(f"## Knowledge base context\n{knowledge_context}")
        if extras:
            base += "\n\n" + "\n\n".join(extras)
        return base

    # --- memory writes --------------------------------------------------
    def _push_short_term(
        self, ctx: AgentRunContext, result: AgentResult, messages: list[dict]
    ) -> None:
        if not self.memory:
            return
        recent = [
            f"{m['role']}: {str(m['content'])[:600]}" for m in messages[-6:] if m.get("content")
        ]
        self.memory.push_short_term(
            self.kind,
            {
                "project": ctx.project.slug if ctx.project else None,
                "task": ctx.task.title if ctx.task else None,
                "exchange": "\n".join(recent),
                "reply": result.reply[:600],
            },
        )

    async def _consolidate_memory(
        self, ctx: AgentRunContext, result: AgentResult, messages: list[dict]
    ) -> int:
        """Persist notable facts to long-term memory (decisions, lessons, outcomes)."""
        if not self.memory or not ctx.session:
            return 0
        written = 0
        # Every run records its outcome for the agent.
        await self.memory.write(
            ctx.session,
            agent_kind=self.kind,
            content=f"Completed {ctx.task.title if ctx.task else 'a task'}: {result.reply[:500]}",
            kind=MemoryKind.TASK.value,
            scope_type="task",
            scope_id=str(ctx.task.id) if ctx.task else "",
            importance=0.6,
            summary=result.reply[:140],
        )
        written += 1

        # Promote notable snippets: detected decision/architecture/lesson markers.
        notable = _extract_notable(messages)
        for kind, text in notable.items():
            await self.memory.write(
                ctx.session,
                agent_kind=self.kind,
                content=text,
                kind=kind,
                scope_type="task",
                scope_id=str(ctx.task.id) if ctx.task else "",
                importance=0.8,
            )
            written += 1
        await ctx.session.flush()
        return written

    # --- status ---------------------------------------------------------
    async def _mark_status(self, ctx: AgentRunContext, status: AgentStatus) -> None:
        try:
            record = await ctx.session.scalar(
                select(AgentRecord).where(AgentRecord.kind == self.kind)
            )
            if record:
                record.status = status.value
                record.heartbeat = datetime.now(UTC)
                await ctx.session.flush()
        except Exception:
            pass

    def _tool_result_text(self, result: ToolResult) -> str:
        if result.success:
            return f"OK\n{result.output[:4000]}"
        return f"ERROR\n{result.error[:4000]}"


# --- helpers --------------------------------------------------------------
# Tools that mutate the filesystem; they require a bound project so agents
# cannot write into the global workspace without an explicit project context.
_WRITE_TOOLS = frozenset({"write_file", "make_dir", "delete_file"})


def parse_tool_call(text: str) -> tuple[str, dict[str, Any]] | None:
    """Extract the last valid JSON block with a 'tool' key from model text.

    Uses balanced-brace scanning so arguments containing nested objects (e.g.
    write_file content or web_search payloads) parse correctly instead of being
    chopped by a flat ``[^{}]*`` regex.
    """
    if not text:
        return None
    found: list[tuple[str, dict[str, Any]]] = []
    for _ in range(_TOOL_SCAN_LIMIT):
        idx = text.rfind('"tool"')
        if idx == -1:
            break
        segment, text = _extract_balanced_block(text, idx)
        if segment is None:
            continue
        try:
            payload = json.loads(segment)
        except json.JSONDecodeError:
            continue
        name = payload.get("tool")
        args = payload.get("arguments") or {}
        if not isinstance(name, str) or not isinstance(args, dict):
            continue
        found.append((name, args))
    # Scanning from the tail means the first valid block found is the last one
    # the model wrote, which is the one that should win.
    return found[0] if found else None


_TOOL_SCAN_LIMIT = 32


def _extract_balanced_block(text: str, key_index: int) -> tuple[str | None, str]:
    """Walk back to the ``{`` enclosing key_index, then forward to the matching ``}``."""
    open_idx = text.rfind("{", 0, key_index)
    if open_idx == -1:
        return None, text
    depth = 0
    in_string = False
    escape = False
    for i in range(open_idx, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[open_idx : i + 1], text[:open_idx] + text[i + 1 :]
    return None, text


def _wants_human(reply: str) -> bool:
    markers = [
        "[NEEDS_HUMAN]",
        "[HUMAN_APPROVAL_REQUIRED]",
        "approval required",
        "I need your approval",
    ]
    return any(m in reply.lower() for m in markers)


def _extract_notable(messages: list[dict[str, Any]]) -> dict[str, str]:
    """Heuristic: pull lines that look like decisions/lessons from the dialogue.

    Only assistant-authored text is considered. Tool outputs, recalled memories
    and knowledge snippets are untrusted (a file or web page could contain
    prompt-injected "decision:" lines) and must never be promoted to long-term
    memory.
    """
    notable: dict[str, str] = {}
    decisions, lessons, architecture = [], [], []
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        content = str(msg.get("content", ""))
        if not content:
            continue
        for line in content.splitlines():
            lowered = line.strip().lower()
            if lowered.startswith(("decision:", "decided", "we decided")):
                decisions.append(line.strip())
            elif lowered.startswith(("lesson:", "learned", "learn:")):
                lessons.append(line.strip())
            elif lowered.startswith(("architecture:", "arch:", "design:")):
                architecture.append(line.strip())
    if decisions:
        notable[MemoryKind.DECISION.value] = "; ".join(decisions)[:2000]
    if lessons:
        notable[MemoryKind.LESSON.value] = "; ".join(lessons)[:2000]
    if architecture:
        notable[MemoryKind.ARCHITECTURE.value] = "; ".join(architecture)[:2000]
    return notable


def time() -> float:
    import time as _t

    return _t.monotonic()
