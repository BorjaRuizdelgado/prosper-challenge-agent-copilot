"""The chat-completions seam of the replay package.

The simulator, caller and judge only talk to a ``ChatClient``; tests pass a
scripted fake so nothing here ever reaches OpenAI. ``OpenAIChatClient`` is the
real implementation.
"""

import json
from dataclasses import dataclass, field
from typing import Optional, Protocol


@dataclass
class ToolCall:
    name: str
    arguments: dict = field(default_factory=dict)
    id: str = "call"


@dataclass
class ChatReply:
    content: Optional[str] = None
    tool_calls: list = field(default_factory=list)  # list[ToolCall]


class ChatClient(Protocol):
    async def chat(
        self,
        *,
        model: str,
        messages: list,
        tools: Optional[list] = None,
        temperature: Optional[float] = None,
        response_format: Optional[dict] = None,
    ) -> ChatReply: ...


class OpenAIChatClient:
    """ChatClient on the OpenAI chat completions API (reads OPENAI_API_KEY)."""

    def __init__(self, client=None):
        if client is None:
            from openai import AsyncOpenAI

            client = AsyncOpenAI()
        self._client = client

    async def chat(self, *, model, messages, tools=None, temperature=None, response_format=None) -> ChatReply:
        kwargs = {"model": model, "messages": messages}
        if tools:
            kwargs["tools"] = tools
        if temperature is not None:
            kwargs["temperature"] = temperature
        if response_format is not None:
            kwargs["response_format"] = response_format
        response = await self._client.chat.completions.create(**kwargs)
        message = response.choices[0].message
        calls = []
        for call in message.tool_calls or []:
            try:
                args = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append(ToolCall(name=call.function.name, arguments=args, id=call.id))
        return ChatReply(content=message.content, tool_calls=calls)
