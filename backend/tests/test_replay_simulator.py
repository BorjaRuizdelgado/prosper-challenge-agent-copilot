import asyncio

from agent_builder.schema import AgentConfig
from replay.simulator import replay

from .fakes import FakeChat, ScriptedCaller, call


def agent(**over):
    data = {
        "name": "t",
        "initial_node": "greet",
        "persona": "You are a clinic receptionist.",
        "nodes": [
            {
                "name": "greet",
                "task_messages": [{"role": "developer", "content": "Greet and ask why they call."}],
                "edges": [
                    {
                        "function": "book",
                        "description": "Caller wants to book",
                        "target": "collect",
                        "properties": {"day": {"type": "string"}},
                        "required": ["day"],
                    }
                ],
            },
            {
                "name": "collect",
                "task_messages": [{"role": "developer", "content": "Confirm the day."}],
                "pre_actions": [{"type": "tts_say", "text": "One moment please."}],
                "edges": [{"function": "done", "description": "Finished", "target": "bye"}],
            },
            {"name": "bye", "task_messages": [{"role": "developer", "content": "Say goodbye."}], "end": True},
            {"name": "dead", "task_messages": [{"role": "developer", "content": "Nothing."}]},
        ],
    }
    data.update(over)
    return AgentConfig.from_dict(data)


def run(cfg, chat, caller, **kw):
    return asyncio.run(replay(cfg, caller, chat, **kw))


def test_transition_with_args_pre_action_and_end_node():
    chat = FakeChat(
        "Hello, how can I help?",
        call("book", day="Friday"),
        "Booked for Friday. Anything else?",
        call("done"),
        "Goodbye!",
    )
    result = run(agent(), chat, ScriptedCaller("I want to book", "No thanks"))

    assert result.ended == "end"
    assert result.path == [
        {"node": "greet"},
        {"node": "collect", "via": "book", "args": {"day": "Friday"}},
        {"node": "bye", "via": "done", "args": {}},
    ]
    assert [(t["speaker"], t["text"]) for t in result.transcript] == [
        ("agent", "Hello, how can I help?"),
        ("caller", "I want to book"),
        ("agent", "One moment please."),
        ("agent", "Booked for Friday. Anything else?"),
        ("caller", "No thanks"),
        ("agent", "Goodbye!"),
    ]
    first = chat.calls[0]
    assert first["messages"][0] == {"role": "system", "content": "You are a clinic receptionist."}
    assert [t["function"]["name"] for t in first["tools"]] == ["book"]
    # the second node exposes only its own edge and keeps the history
    assert [t["function"]["name"] for t in chat.calls[2]["tools"]] == ["done"]
    assert any(m.get("role") == "tool" and '"day": "Friday"' in m["content"] for m in chat.calls[2]["messages"])


def test_dead_end_hits_the_turn_limit():
    cfg = agent(initial_node="dead")
    chat = FakeChat(*["Hmm."] * 3)
    result = run(cfg, chat, ScriptedCaller("a", "b", "c"), max_turns=3)

    assert result.ended == "stuck"
    assert len([t for t in result.transcript if t["speaker"] == "agent"]) == 3


def test_caller_hangup_ends_the_call():
    result = run(agent(), FakeChat("Hello?"), ScriptedCaller("Never mind, bye. [HANGUP]"))

    assert result.ended == "hangup"
    assert result.transcript[-1] == {"speaker": "caller", "text": "Never mind, bye."}


def test_post_action_tts_say_is_spoken_verbatim_then_call_ends():
    cfg = agent(initial_node="x")
    cfg.nodes.append(
        type(cfg.nodes[0]).from_dict(
            {
                "name": "x",
                "task_messages": [],
                "post_actions": [{"type": "tts_say", "text": "Transferring you."}, {"type": "end_conversation"}],
            }
        )
    )
    result = run(cfg, FakeChat("Let me connect you."), ScriptedCaller())

    assert result.ended == "end"
    assert result.transcript[-1] == {"speaker": "agent", "text": "Transferring you."}


def test_unknown_function_is_reported_back_and_does_not_move():
    chat = FakeChat(
        call("nope"),
        "Sorry.",
    )
    result = run(agent(), chat, ScriptedCaller("ok"), max_turns=2)

    assert [p["node"] for p in result.path] == ["greet"]


def test_on_line_sees_every_transcript_line_in_order():
    seen = []
    result = run(agent(), FakeChat("Hello?"), ScriptedCaller("Never mind, bye. [HANGUP]"), on_line=seen.append)

    assert seen == result.transcript and len(seen) == 2
