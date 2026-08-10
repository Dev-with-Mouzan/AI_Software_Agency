"""LLM provider interfaces and the null/offline provider."""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field


class ToolSchema(BaseModel):
    """OpenAI-style function schema used across all providers."""

    name: str
    description: str = ""
    parameters: dict[str, Any] = Field(default_factory=dict)


class ToolCall(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class LLMResponse(BaseModel):
    text: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    finish_reason: str = "stop"
    usage: dict[str, Any] = Field(default_factory=dict)


class BaseLLMProvider(ABC):
    """Interface every LLM provider adapter must implement."""

    name: str
    model: str

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolSchema] | None = None,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        """Send a chat completion.

        messages: list of {"role": "system"|"user"|"assistant"|"tool", "content": ...}
        Returns text and/or structured tool calls.
        """

    async def embed(self, text: str) -> list[float]:
        """Return a dense embedding vector for `text`. Optional to implement."""
        raise NotImplementedError


class NullProvider(BaseLLMProvider):
    """Deterministic offline provider used for tests and demos.

    It does not call an LLM. It echoes instructions back and, when a tool is
    available, produces a scripted tool call. Enables the full system to run
    with zero external dependencies.
    """

    name = "null"
    model = "offline"

    def __init__(self, model: str = "offline", temperature: float = 0.0) -> None:
        self.model = model
        self.temperature = temperature

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolSchema] | None = None,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        from agency.config import get_settings

        _ = temperature, max_tokens
        last_user = ""
        for msg in reversed(messages):
            if msg.get("role") in {"user", "tool"}:
                last_user = str(msg.get("content", ""))
                break

        # Scripted behavior: if the user asks to scaffold/run, call the matching tool.
        scripted: dict[str, str] = {
            "scaffold": "write_file",
            "create files": "write_file",
            "run tests": "run_command",
            "lint": "run_command",
            "search": "knowledge_search",
            "remember": "memory_write",
        }
        if tools:
            for keyword, tool_name in scripted.items():
                if keyword in last_user.lower() and any(t.name == tool_name for t in tools):
                    args: dict[str, Any] = {"path": "backend/README.md"}
                    if tool_name == "knowledge_search":
                        args = {"query": last_user[:200]}
                    if tool_name == "memory_write":
                        args = {"content": last_user[:500]}
                    if tool_name == "run_command":
                        args = {"command": "echo offline"}
                    return LLMResponse(
                        text="",
                        tool_calls=[
                            ToolCall(
                                id=f"call_{int(time.time())}",
                                name=tool_name,
                                arguments=args,
                            )
                        ],
                        finish_reason="tool_calls",
                    )

        mode = get_settings().environment
        reply = (
            f"[{self.model}] Received: {last_user[:400]}\n"
            f"Running in offline (null) provider mode. Configure LLM_PROVIDER to get "
            f"intelligent agent responses. Environment: {mode}."
        )
        return LLMResponse(text=reply, finish_reason="stop")

    async def embed(self, text: str) -> list[float]:
        return local_embed(text)


def local_embed(text: str, dim: int = 768) -> list[float]:
    """Deterministic bag-of-char-n-gram embedding used as an offline fallback.

    Produces a normalized sparse-ish vector that supports cosine similarity.
    Swap for a real embedding model in production (see knowledge/vector.py).
    """
    import hashlib

    vec = [0.0] * dim
    tokens = _tokenize(text)
    for tok in tokens:
        idx = int(hashlib.md5(tok.encode("utf-8")).hexdigest()[:8], 16) % dim
        vec[idx] += 1.0
    norm = sum(v * v for v in vec) ** 0.5
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


def _tokenize(text: str, n: int = 3) -> list[str]:
    clean = " ".join(text.lower().split())
    if len(clean) <= n:
        return [clean] if clean else []
    return [clean[i : i + n] for i in range(max(1, len(clean) - n + 1))]
