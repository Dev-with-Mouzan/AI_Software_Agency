"""LLM provider interfaces and the null/offline provider."""

from __future__ import annotations

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
    """Deterministic offline provider used ONLY by the test environment.

    It does not call an LLM and never fabricates work: there are no scripted
    tool calls, so it cannot create/modify files or report completed actions.
    It only ever returns a clear "provider not configured" message, which the
    execution gates refuse to treat as a successful run in real environments.
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
        _ = messages, tools, temperature, max_tokens
        reply = (
            "⚠️ No AI provider is configured.\n\n"
            "To get intelligent responses from this agent, please go to **Settings** and "
            "add an API key for one of the supported providers (OpenAI, Gemini, DeepSeek, or Qwen).\n\n"
            "Once an API key is saved, your agents will be fully operational."
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
