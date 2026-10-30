"""Text simulator: one conversation between an agent graph and a simulated caller.

Mirrors the voice runtime closely enough for a failure to reproduce: the agent
speaks first, each node sets its role message and appends its task messages,
only that node's edges are tools, an edge call records the transition and
enters the target, ``tts_say`` is spoken verbatim and ``end_conversation`` (or
an ``end`` node) ends the call. Voice effects are not simulated.
"""

import json
from dataclasses import dataclass, field

from agent_builder.schema import AgentConfig

from .client import ChatClient
from .nodes import NodeSpec, build_nodes

HANGUP = "[HANGUP]"


@dataclass
class SimResult:
    transcript: list = field(default_factory=list)  # [{speaker, text}]
    path: list = field(default_factory=list)  # [{node} | {node, via, args}]
    ended: str = "stuck"  # "end" | "hangup" | "stuck"


async def replay(agent: AgentConfig, caller, chat_client: ChatClient, max_turns: int = 12) -> SimResult:
    """Run one call. ``caller`` has ``async reply(transcript) -> str``."""
    nodes = build_nodes(agent)
    result = SimResult()
    history: list = []  # OpenAI messages, without the system message

    def say(text: str) -> None:
        result.transcript.append({"speaker": "agent", "text": text})
        history.append({"role": "assistant", "content": text})

    def enter(name: str, via: str = None, args: dict = None) -> NodeSpec:
        node = nodes[name]
        step = {"node": name}
        if via is not None:
            step.update(via=via, args=args or {})
        result.path.append(step)
        history.extend(dict(m) for m in node.task_messages)
        for action in node.pre_actions:
            if action.get("type") == "tts_say":
                say(action.get("text", ""))
        return node

    node = enter(agent.initial_node)
    for _ in range(max_turns):
        reply = await chat_client.chat(
            model=agent.model,
            messages=[{"role": "system", "content": node.system}, *history],
            tools=node.tools or None,
        )
        call = reply.tool_calls[0] if reply.tool_calls else None
        if reply.content:
            result.transcript.append({"speaker": "agent", "text": reply.content})
        assistant = {"role": "assistant", "content": reply.content}
        if call:
            assistant["tool_calls"] = [
                {"id": call.id, "type": "function", "function": {"name": call.name, "arguments": json.dumps(call.arguments)}}
            ]
        history.append(assistant)

        if call:
            target = node.edges.get(call.name)
            if target is None:
                content = {"status": "error", "error": f"unknown function {call.name}"}
                history.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(content)})
                continue
            content = {"status": "success", **call.arguments}
            history.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(content)})
            node = enter(target, call.name, call.arguments)
            continue

        ended = False
        for action in node.post_actions:
            if action.get("type") == "tts_say":
                say(action.get("text", ""))
            elif action.get("type") == "end_conversation":
                ended = True
        if ended:
            result.ended = "end"
            return result

        text = (await caller.reply(result.transcript)).strip()
        if HANGUP in text:
            spoken = text.replace(HANGUP, "").strip()
            if spoken:
                result.transcript.append({"speaker": "caller", "text": spoken})
            result.ended = "hangup"
            return result
        result.transcript.append({"speaker": "caller", "text": text})
        history.append({"role": "user", "content": text})

    result.ended = "stuck"
    return result
