"""Message translation tests: neutral loop format -> per-provider wire format."""

from __future__ import annotations

from typing import Any

from agency.agents.base import parse_tool_call
from agency.llm.adapters import _anthropic_messages, _gemini_contents, _openai_messages

NEUTRAL: list[dict[str, Any]] = [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Review the code."},
    {
        "role": "assistant",
        "content": "",
        "tool_calls": [{"id": "call_abc", "name": "read_file", "arguments": {"path": "app.py"}}],
    },
    {
        "role": "tool",
        "tool_call_id": "call_abc",
        "tool_name": "read_file",
        "content": "OK\nprint('hi')",
    },
    {"role": "assistant", "content": "Done."},
]


def test_openai_messages_carries_tool_call_id() -> None:
    wire = _openai_messages(NEUTRAL)
    tool_call = wire[2]
    assert tool_call["role"] == "assistant"
    assert tool_call["tool_calls"][0]["id"] == "call_abc"
    assert tool_call["tool_calls"][0]["type"] == "function"
    assert tool_call["tool_calls"][0]["function"]["name"] == "read_file"
    assert '"app.py"' in tool_call["tool_calls"][0]["function"]["arguments"]

    tool_result = wire[3]
    assert tool_result["role"] == "tool"
    assert tool_result["tool_call_id"] == "call_abc"
    assert tool_result["content"] == "OK\nprint('hi')"


def test_anthropic_messages_builds_tool_use_and_tool_result() -> None:
    wire = _anthropic_messages(NEUTRAL)
    assert wire[0]["role"] == "user"
    assistant = wire[1]
    assert assistant["role"] == "assistant"
    assert assistant["content"][0]["type"] == "tool_use"
    assert assistant["content"][0]["id"] == "call_abc"
    assert assistant["content"][0]["input"] == {"path": "app.py"}

    tool_result = wire[2]
    assert tool_result["role"] == "user"
    assert tool_result["content"][0]["type"] == "tool_result"
    assert tool_result["content"][0]["tool_use_id"] == "call_abc"


def test_gemini_contents_builds_function_call_and_response() -> None:
    wire = _gemini_contents(NEUTRAL)
    function_call = wire[1]
    assert function_call["role"] == "model"
    assert function_call["parts"][0]["functionCall"]["name"] == "read_file"
    assert function_call["parts"][0]["functionCall"]["args"] == {"path": "app.py"}

    function_response = wire[2]
    assert function_response["parts"][0]["functionResponse"]["name"] == "read_file"
    assert function_response["parts"][0]["functionResponse"]["response"]["result"].startswith("OK")


def test_parse_tool_call_flat_json() -> None:
    name, args = parse_tool_call('{"tool": "read_file", "arguments": {"path": "app.py"}}')  # type: ignore[misc]
    assert name == "read_file"
    assert args == {"path": "app.py"}


def test_parse_tool_call_nested_arguments() -> None:
    text = (
        '{"tool": "write_file", "arguments": '
        '{"path": "main.py", "content": "def f(x):\\n  return {\\"a\\": 1}\\n"}}'
    )
    name, args = parse_tool_call(text)  # type: ignore[misc]
    assert name == "write_file"
    assert args["path"] == "main.py"
    assert args["content"] == 'def f(x):\n  return {"a": 1}\n'


def test_parse_tool_call_picks_last_valid_block() -> None:
    text = (
        'Thought: maybe read first. {"tool": "read_file", "arguments": {"path": "x.py"}}\n'
        'Actually write: {"tool": "write_file", "arguments": {"path": "y.py", '
        '"content": "{\\"nested\\": true}"}}'
    )
    name, args = parse_tool_call(text)  # type: ignore[misc]
    assert name == "write_file"
    assert args["path"] == "y.py"
    assert args["content"] == '{"nested": true}'


def test_parse_tool_call_ignores_invalid_blocks() -> None:
    assert parse_tool_call("no tool calls here") is None
    assert parse_tool_call('{"tool": 42}') is None
    assert parse_tool_call('{"arguments": {"path": "x.py"}}') is None
