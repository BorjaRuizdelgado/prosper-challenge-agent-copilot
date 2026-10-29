import asyncio
from types import SimpleNamespace

from agent_builder import AgentBuilder
from session import node_changed_message

AGENT = {
    "name": "T",
    "initial_node": "a",
    "nodes": [
        {
            "name": "a",
            "task_messages": [{"role": "developer", "content": "x"}],
            "edges": [
                {
                    "function": "go",
                    "description": "d",
                    "target": "b",
                    "properties": {"who": {"type": "string"}},
                    "required": ["who"],
                }
            ],
        },
        {"name": "b", "task_messages": [{"role": "developer", "content": "y"}], "end": True},
    ],
}


def run_edge(builder):
    handler = builder.build_initial_node()["functions"][0].handler
    flow_manager = SimpleNamespace(state={})
    return asyncio.run(handler({"who": "Ana"}, flow_manager))


def test_sync_callback_receives_transition():
    calls = []
    builder = AgentBuilder.from_dict(AGENT)
    builder.on_transition = lambda *a: calls.append(a)
    result, next_node = run_edge(builder)
    assert calls == [("a", "b", "go", {"who": "Ana"})]
    assert next_node["name"] == "b"


def test_async_callback_is_awaited():
    calls = []

    async def cb(*a):
        calls.append(a)

    builder = AgentBuilder.from_dict(AGENT)
    builder.on_transition = cb
    run_edge(builder)
    assert calls == [("a", "b", "go", {"who": "Ana"})]


def test_no_callback_is_fine():
    _, next_node = run_edge(AgentBuilder.from_dict(AGENT))
    assert next_node["name"] == "b"


def test_node_changed_message_shape():
    assert node_changed_message("a", "b", "go", {"who": "Ana"}) == {
        "type": "node_changed", "from": "a", "node": "b", "via": "go", "args": {"who": "Ana"},
    }
