"""Scripted fake ChatClient: replies are consumed in order; calls are recorded."""

from replay.client import ChatReply, ToolCall


def say(text):
    return ChatReply(content=text)


def call(name, text=None, **args):
    return ChatReply(content=text, tool_calls=[ToolCall(name=name, arguments=args, id="c1")])


class FakeChat:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    async def chat(self, **kwargs):
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        return reply if isinstance(reply, ChatReply) else ChatReply(content=reply)


class ScriptedCaller:
    def __init__(self, *lines):
        self.lines = list(lines)

    async def reply(self, transcript):
        return self.lines.pop(0)
