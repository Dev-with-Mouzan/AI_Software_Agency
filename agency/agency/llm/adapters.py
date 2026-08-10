"""Provider adapters for OpenAI, Anthropic and Gemini.

Each adapter is import-safe: the underlying SDK is imported lazily inside the
class so that missing optional dependencies raise a clear error instead of
breaking the whole application.
"""

from __future__ import annotations

import json
from typing import Any

from agency.config import get_settings
from agency.llm.provider import (
    BaseLLMProvider,
    LLMResponse,
    ToolCall,
    ToolSchema,
    local_embed,
)
from agency.services import settings as runtime_settings


def _openai_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Translate the neutral message list into the OpenAI/DeepSeek wire format.

    The agent loop stores assistant tool calls and tool results as structured
    keys (`tool_calls`, `tool_call_id`); the OpenAI-compatible APIs require the
    assistant `tool_calls` array and a matching `tool_call_id` on each tool
    result, otherwise the request fails deserialization.
    """
    out: list[dict[str, Any]] = []
    for m in messages:
        role = m.get("role")
        if role == "assistant":
            item: dict[str, Any] = {"role": "assistant", "content": m.get("content") or ""}
            tcs = m.get("tool_calls")
            if tcs:
                item["tool_calls"] = [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": json.dumps(tc.get("arguments") or {}, ensure_ascii=False),
                        },
                    }
                    for tc in tcs
                ]
            out.append(item)
        elif role == "tool":
            out.append(
                {
                    "role": "tool",
                    "tool_call_id": m.get("tool_call_id") or "",
                    "content": m.get("content") or "",
                }
            )
        else:
            out.append({"role": role, "content": m.get("content") or ""})
    return out


def _anthropic_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Translate the neutral message list into the Anthropic wire format."""
    out: list[dict[str, Any]] = []
    for m in messages:
        role = m.get("role")
        if role == "system":
            continue
        if role == "user":
            out.append({"role": "user", "content": m.get("content") or ""})
        elif role == "assistant":
            content: list[dict[str, Any]] = []
            if m.get("content"):
                content.append({"type": "text", "text": m["content"]})
            for tc in m.get("tool_calls") or []:
                content.append(
                    {
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["name"],
                        "input": tc.get("arguments") or {},
                    }
                )
            out.append({"role": "assistant", "content": content or [{"type": "text", "text": ""}]})
        elif role == "tool":
            # Merge consecutive tool results into one user message (Anthropic
            # rejects consecutive user roles).
            block: dict[str, Any] = {
                "type": "tool_result",
                "tool_use_id": m.get("tool_call_id") or "",
                "content": m.get("content") or "",
            }
            if out and out[-1].get("role") == "user" and isinstance(out[-1]["content"], list):
                out[-1]["content"].append(block)
            else:
                out.append({"role": "user", "content": [block]})
    return out


def _gemini_contents(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Translate the neutral message list into Gemini contents parts."""
    contents: list[dict[str, Any]] = []
    for m in messages:
        role = m.get("role")
        if role == "system":
            continue
        if role == "tool":
            contents.append(
                {
                    "role": "model",
                    "parts": [
                        {
                            "functionResponse": {
                                "name": m.get("tool_name") or "",
                                "response": {"result": m.get("content") or ""},
                            }
                        }
                    ],
                }
            )
            continue
        parts: list[dict[str, Any]] = []
        if m.get("content"):
            parts.append({"text": m["content"]})
        for tc in m.get("tool_calls") or []:
            parts.append({"functionCall": {"name": tc["name"], "args": tc.get("arguments") or {}}})
        if parts:
            contents.append({"role": "model" if role == "assistant" else "user", "parts": parts})
    return contents


class OpenAIProvider(BaseLLMProvider):
    name = "openai"

    def __init__(self, model: str, api_key: str, base_url: str | None = None) -> None:
        try:
            from openai import AsyncOpenAI
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Install extra `llm` to use the OpenAI provider.") from exc
        self.model = model
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolSchema] | None = None,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        from agency.observability.metrics import LLM_CALLS, LLM_LATENCY

        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": _openai_messages(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = [{"type": "function", "function": t.model_dump()} for t in tools]
        LLM_CALLS.labels(provider=self.name, model=self.model).inc()
        import time

        start = time.perf_counter()
        try:
            resp = await self._client.chat.completions.create(**kwargs)
        finally:
            LLM_LATENCY.labels(self.name).observe(time.perf_counter() - start)

        choice = resp.choices[0]
        tool_calls = []
        for tc in choice.message.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {"_raw": tc.function.arguments}
            tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=args))

        return LLMResponse(
            text=choice.message.content or "",
            tool_calls=tool_calls,
            finish_reason=choice.finish_reason or "stop",
            usage=resp.usage.model_dump() if resp.usage else {},
        )

    async def embed(self, text: str) -> list[float]:
        settings = get_settings()
        resp = await self._client.embeddings.create(model=settings.embedding_model, input=text)
        return resp.data[0].embedding


class DeepSeekProvider(OpenAIProvider):
    """DeepSeek via its OpenAI-compatible API.

    Uses the same function-calling protocol as OpenAI, so it inherits the
    OpenAI adapter with a custom base URL and model name.
    """

    name = "deepseek"

    def __init__(self, model: str, api_key: str, base_url: str | None = None) -> None:
        super().__init__(model=model, api_key=api_key, base_url=base_url)
        self.base_url = base_url


class OllamaProvider(OpenAIProvider):
    """Local Ollama models via its OpenAI-compatible API.

    Ollama exposes `/v1` (OpenAI protocol) so this inherits the OpenAI adapter
    with a local base URL and a dummy key (Ollama does not require auth).
    """

    name = "ollama"

    def __init__(self, model: str, base_url: str | None = None) -> None:
        super().__init__(model=model, api_key="ollama", base_url=base_url or None)


class LangChainProvider(BaseLLMProvider):
    """OpenAI-compatible LLM integration through LangChain.

    Used for any OpenAI-compatible provider (DeepSeek, Qwen/DashScope, ...).
    Routes the neutral message list through langchain-core messages and lets
    `langchain-openai` handle the wire protocol, tool calling and parsing.
    """

    def __init__(
        self,
        name: str,
        model: str,
        api_key: str,
        base_url: str | None = None,
        temperature: float | None = None,
    ) -> None:
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "Install extra `llm` (langchain-openai) to use this provider."
            ) from exc
        self.name = name
        self.model = model
        self._llm = ChatOpenAI(
            model=model,
            api_key=api_key or "missing",
            base_url=base_url,
            temperature=temperature,
        )

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolSchema] | None = None,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

        from agency.observability.metrics import LLM_CALLS, LLM_LATENCY

        lc_messages: list[Any] = []
        for m in messages:
            role = m.get("role")
            content = m.get("content") or ""
            if role == "system":
                lc_messages.append(SystemMessage(content=content))
            elif role == "user":
                lc_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                tool_calls = m.get("tool_calls") or []
                lc_messages.append(
                    AIMessage(
                        content=content,
                        tool_calls=[
                            {
                                "name": tc["name"],
                                "args": tc.get("arguments") or {},
                                "id": tc["id"],
                            }
                            for tc in tool_calls
                        ]
                        or None,
                    )
                )
            elif role == "tool":
                lc_messages.append(
                    ToolMessage(content=content, tool_call_id=m.get("tool_call_id") or "")
                )

        call_kwargs: dict[str, Any] = {}
        if temperature is not None:
            call_kwargs["temperature"] = temperature
        if max_tokens is not None:
            call_kwargs["max_tokens"] = max_tokens

        LLM_CALLS.labels(provider=self.name, model=self.model).inc()
        import time

        start = time.perf_counter()
        try:
            llm = (
                self._llm.bind_tools([t.model_dump() for t in tools]) if tools else self._llm
            )
            resp = await llm.ainvoke(lc_messages, **call_kwargs)
        finally:
            LLM_LATENCY.labels(self.name).observe(time.perf_counter() - start)

        if isinstance(resp.content, str):
            text = resp.content
        else:
            text = "".join(
                block.get("text", "")
                for block in (resp.content or [])
                if isinstance(block, dict)
            )

        tool_calls = [
            ToolCall(id=tc.get("id", ""), name=tc["name"], arguments=tc.get("args") or {})
            for tc in getattr(resp, "tool_calls", None) or []
        ]
        metadata = getattr(resp, "response_metadata", {}) or {}
        usage = (getattr(resp, "usage_metadata", None) or {}).copy()
        return LLMResponse(
            text=text,
            tool_calls=tool_calls,
            finish_reason=metadata.get("finish_reason") or "stop",
            usage=usage,
        )


class LangChainGeminiProvider(LangChainProvider):
    """Gemini via LangChain (`langchain-google-genai`).

    Shares the message/tool handling of LangChainProvider (LangChain normalises
    the wire protocol), so only the LLM construction differs.
    """

    name = "gemini"

    def __init__(
        self, model: str, api_key: str, temperature: float | None = None
    ) -> None:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "Install extra `llm` (langchain-google-genai) to use the Gemini "
                "provider through LangChain."
            ) from exc
        self.name = "gemini"
        self.model = model
        self._llm = ChatGoogleGenerativeAI(
            model=model, api_key=api_key, temperature=temperature
        )


class AnthropicProvider(BaseLLMProvider):
    name = "anthropic"

    def __init__(self, model: str, api_key: str) -> None:
        try:
            from anthropic import AsyncAnthropic
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Install extra `llm` to use the Anthropic provider.") from exc
        self.model = model
        self._client = AsyncAnthropic(api_key=api_key)

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolSchema] | None = None,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        from agency.observability.metrics import LLM_CALLS, LLM_LATENCY

        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        api_messages = _anthropic_messages(messages)

        anthropic_tools = None
        if tools:
            anthropic_tools = [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters or {"type": "object", "properties": {}},
                }
                for t in tools
            ]

        LLM_CALLS.labels(provider=self.name, model=self.model).inc()
        import time

        start = time.perf_counter()
        try:
            resp = await self._client.messages.create(  # type: ignore[arg-type]
                model=self.model,
                max_tokens=max_tokens or 4096,
                temperature=temperature,  # type: ignore[arg-type]
                system=system or None,  # type: ignore[arg-type]
                messages=api_messages,  # type: ignore[arg-type]
                tools=anthropic_tools,  # type: ignore[arg-type]
            )
        finally:
            LLM_LATENCY.labels(self.name).observe(time.perf_counter() - start)

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCall(id=block.id, name=block.name, arguments=dict(block.input))
                )
        return LLMResponse(
            text="".join(text_parts),
            tool_calls=tool_calls,
            finish_reason=resp.stop_reason or "stop",
            usage={
                "input_tokens": resp.usage.input_tokens,
                "output_tokens": resp.usage.output_tokens,
            },
        )


class GeminiProvider(BaseLLMProvider):
    name = "gemini"

    def __init__(self, model: str, api_key: str) -> None:
        try:
            from google import genai
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Install extra `llm` to use the Gemini provider.") from exc
        self.model = model
        self._client = genai.Client(api_key=api_key)

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolSchema] | None = None,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        from google.genai import types as gtypes

        from agency.observability.metrics import LLM_CALLS, LLM_LATENCY

        contents: list[dict[str, Any]] = _gemini_contents(messages)
        system_prompt = "\n\n".join(m["content"] for m in messages if m["role"] == "system")

        genai_tools = None
        if tools:
            genai_tools = [
                gtypes.Tool(
                    function_declarations=[
                        {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters,
                        }
                        for t in tools
                    ]
                )
            ]

        LLM_CALLS.labels(provider=self.name, model=self.model).inc()
        import time

        start = time.perf_counter()
        try:
            resp = await self._client.aio.models.generate_content(
                model=self.model,
                contents=contents,
                config=gtypes.GenerateContentConfig(
                    system_instruction=system_prompt or None,
                    tools=genai_tools,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                ),
            )
        finally:
            LLM_LATENCY.labels(self.name).observe(time.perf_counter() - start)

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for part in resp.candidates[0].content.parts if resp.candidates else []:
            if part.text:
                text_parts.append(part.text)
            if part.function_call:
                fc = part.function_call
                tool_calls.append(
                    ToolCall(
                        id=fc.id or f"call_{int(time.time())}",
                        name=fc.name,
                        arguments=dict((fc.args or {}).items()),
                    )
                )
        return LLMResponse(text="".join(text_parts), tool_calls=tool_calls)


def build_langchain_provider(
    provider: str,
    model: str,
    api_key: str,
    base_url: str = "",
    temperature: float | None = None,
) -> BaseLLMProvider:
    """Build a LangChain-backed provider for the given name.

    OpenAI, DeepSeek and Qwen all speak the OpenAI protocol and use
    `langchain-openai`; Gemini uses `langchain-google-genai`.
    """
    if provider == "gemini":
        return LangChainGeminiProvider(model=model, api_key=api_key, temperature=temperature)
    return LangChainProvider(
        name=provider,
        model=model,
        api_key=api_key,
        base_url=base_url or None,
        temperature=temperature,
    )


def _build_runtime_provider(provider: str, model: str = "") -> BaseLLMProvider:
    """Build a provider from the Settings UI credentials (merged with env)."""
    key = runtime_settings.provider_key(provider)
    if not key:
        label = runtime_settings.PROVIDER_LABELS.get(provider, provider)
        raise RuntimeError(
            f"Agent requires the {label} provider but no API key is configured. "
            "Open Settings to connect one."
        )
    return build_langchain_provider(
        provider=provider,
        model=model or runtime_settings.provider_model(provider),
        api_key=key,
        base_url=runtime_settings.provider_base_url(provider),
    )


def get_provider() -> BaseLLMProvider:
    """Build the default LLM provider.

    Prefers the runtime default chosen in the Settings UI, then any provider
    with configured credentials, then the env-driven `LLM_PROVIDER`.
    """
    settings = get_settings()

    default = runtime_settings.runtime_default_provider()
    if default:
        return _build_runtime_provider(default)
    for provider in runtime_settings.PROVIDERS:
        if runtime_settings.has_provider(provider):
            return _build_runtime_provider(provider)

    provider = settings.llm_provider.lower()

    if provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required for the openai provider.")
        return OpenAIProvider(settings.llm_model, settings.openai_api_key)
    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required for the anthropic provider.")
        return AnthropicProvider(settings.anthropic_model, settings.anthropic_api_key)
    if provider == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is required for the gemini provider.")
        return GeminiProvider(settings.gemini_model, settings.gemini_api_key)
    if provider == "ollama":
        return OllamaProvider(settings.ollama_model, settings.ollama_base_url)
    if provider == "deepseek":
        if not settings.deepseek_api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is required for the deepseek provider.")
        return _deepseek_provider()

    from agency.llm.provider import NullProvider

    if provider in {"null", "mock", "offline"}:
        return NullProvider(model=settings.llm_model, temperature=settings.llm_temperature)

    raise RuntimeError(
        f"Unknown LLM_PROVIDER={settings.llm_provider!r}. "
        "Supported: openai, anthropic, gemini, ollama, deepseek, null."
    )


def _deepseek_provider() -> BaseLLMProvider:
    settings = get_settings()
    return DeepSeekProvider(
        model=settings.deepseek_model,
        api_key=settings.deepseek_api_key or "",
        base_url=settings.deepseek_base_url,
    )


def _provider_credentials(provider: str) -> tuple[str | None, str | None]:
    """Provider-level api_key/base_url fallbacks used when an agent config omits them."""
    settings = get_settings()
    if provider == "deepseek":
        return settings.deepseek_api_key, settings.deepseek_base_url
    if provider == "qwen":
        return settings.qwen_api_key, settings.qwen_base_url
    if provider == "ollama":
        return "ollama", settings.ollama_base_url
    if provider == "openai":
        return settings.openai_api_key, None
    if provider == "anthropic":
        return settings.anthropic_api_key, None
    return None, None


def get_agent_provider(kind: str) -> BaseLLMProvider:
    """Pick the LLM provider for a given agent kind.

    Resolution order:
      1. Settings-UI per-agent assignment — always integrated through LangChain
         (`langchain-openai` for OpenAI/DeepSeek/Qwen, `langchain-google-genai`
         for Gemini).
      2. Settings-UI default provider.
      3. `AGENT_MODELS[kind]` (env-driven per-agent model routing).
      4. Legacy `deepseek_agents` list + `DEEPSEEK_API_KEY`.
      5. The default provider (`get_provider()`).
    """
    assignment = runtime_settings.runtime_agent_assignment(kind)
    if assignment:
        return _build_runtime_provider(assignment[0], assignment[1])

    default = runtime_settings.runtime_default_provider()
    if default:
        return _build_runtime_provider(default)

    settings = get_settings()
    conf = settings.agent_models.get(kind)
    if conf is not None:
        if conf.provider in {"deepseek", "qwen", "openai", "ollama"}:
            key, base_url = _provider_credentials(conf.provider)
            if not (conf.api_key or key) and conf.provider != "ollama":
                raise RuntimeError(
                    f"AGENT_MODELS[{kind}] requires an API key for provider "
                    f"{conf.provider!r}."
                )
            return LangChainProvider(
                name=conf.provider,
                model=conf.model or settings.deepseek_model,
                api_key=conf.api_key or key or "",
                base_url=conf.base_url or base_url,
            )
        if conf.provider == "anthropic":
            if not settings.anthropic_api_key:
                raise RuntimeError(
                    f"AGENT_MODELS[{kind}] requires ANTHROPIC_API_KEY for provider 'anthropic'."
                )
            return AnthropicProvider(
                conf.model or settings.anthropic_model, settings.anthropic_api_key
            )
        if conf.provider == "gemini":
            if not settings.gemini_api_key:
                raise RuntimeError(
                    f"AGENT_MODELS[{kind}] requires GEMINI_API_KEY for provider 'gemini'."
                )
            return GeminiProvider(conf.model or settings.gemini_model, settings.gemini_api_key)
        raise RuntimeError(
            f"AGENT_MODELS[{kind}] references unsupported provider {conf.provider!r}."
        )
    if settings.deepseek_api_key and kind in settings.deepseek_agents:
        return _deepseek_provider()
    return get_provider()


async def get_embedding(text: str) -> list[float]:
    """Embed text using the configured provider, with a local fallback."""
    settings = get_settings()
    provider = settings.embedding_provider or "local"
    try:
        if provider in {"openai", "huggingface"} and settings.llm_provider == "openai":
            return await get_provider().embed(text)
    except Exception:
        pass
    return local_embed(text)
