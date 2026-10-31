import asyncio
import json

from replay.caller import Caller, build_prompt, goal_for
from replay.judge import SCHEMA, judge
from replay.simulator import SimResult

from .fakes import FakeChat

RUN = {
    "id": "r-1",
    "goal": "Cancel the Friday appointment",
    "transcript": [
        {"speaker": "agent", "text": "Hello, how can I help?"},
        {"speaker": "caller", "text": "I need to cancel Friday's visit"},
        {"speaker": "agent", "text": "Name?"},
        {"speaker": "caller", "text": "Ana Ruiz"},
    ],
}


def test_caller_prompt_carries_goal_and_original_lines():
    prompt = build_prompt(RUN, RUN["goal"])

    assert "Cancel the Friday appointment" in prompt
    assert "1. I need to cancel Friday's visit" in prompt
    assert "2. Ana Ruiz" in prompt
    assert "Hello, how can I help?" not in prompt
    assert "[HANGUP]" in prompt


def test_caller_reply_flips_roles_and_uses_mini_model():
    chat = FakeChat("Cancel Friday please")
    caller = Caller(RUN, RUN["goal"], chat)
    text = asyncio.run(caller.reply([{"speaker": "agent", "text": "Hi"}]))

    assert text == "Cancel Friday please"
    call = chat.calls[0]
    assert call["model"] == "gpt-4o-mini" and call["temperature"] == 0.4
    assert call["messages"][1] == {"role": "user", "content": "Hi"}


def test_goal_falls_back_to_a_cached_summary(tmp_path):
    run = {k: v for k, v in RUN.items() if k != "goal"}
    cache = tmp_path / "goals.json"
    chat = FakeChat("Cancel a visit.")

    assert asyncio.run(goal_for(run, chat, cache)) == "Cancel a visit."
    assert asyncio.run(goal_for(run, chat, cache)) == "Cancel a visit."  # cached: no second reply scripted
    assert json.loads(cache.read_text()) == {"r-1": "Cancel a visit."}
    assert asyncio.run(goal_for(RUN, chat)) == RUN["goal"]


def verdict(outcome, met, reason="because"):
    return json.dumps({"outcome": outcome, "goal_met": met, "reason": reason})


def run_judge(sim, reply):
    chat = FakeChat(reply)
    out = asyncio.run(judge("Cancel", RUN["transcript"], sim, chat))
    return out, chat.calls[0]


def test_judge_passes_the_verdict_through_and_asks_for_json_schema():
    sim = SimResult(transcript=[{"speaker": "agent", "text": "Done."}], ended="end")
    out, call = run_judge(sim, verdict("completed", True))

    assert out == {"outcome": "completed", "goal_met": True, "reason": "because"}
    assert call["response_format"] == SCHEMA
    assert "Cancel" in call["messages"][1]["content"] and "Done." in call["messages"][1]["content"]


def test_judge_prompt_rejects_invented_answers_but_allows_handoffs():
    system = run_judge(SimResult(transcript=[], ended="end"), verdict("completed", True))[1]["messages"][0]["content"]

    assert "medication-safety advice" in system and "could not know" in system
    assert "handoff to staff" in system and "emergency services" in system


def test_turn_limit_overrides_to_stuck():
    sim = SimResult(transcript=[{"speaker": "agent", "text": "Hmm."}], ended="stuck")
    out, _ = run_judge(sim, verdict("completed", True))

    assert out["outcome"] == "stuck" and out["goal_met"] is False


def test_emergency_then_hangup_is_transferred_and_met():
    sim = SimResult(
        transcript=[
            {"speaker": "agent", "text": "Please hang up and call emergency services now."},
            {"speaker": "caller", "text": "Okay, bye."},
        ],
        ended="hangup",
    )
    out, _ = run_judge(sim, verdict("abandoned", False))

    assert out["outcome"] == "transferred" and out["goal_met"] is True


def test_plain_hangup_is_left_to_the_judge():
    sim = SimResult(transcript=[{"speaker": "agent", "text": "Name?"}], ended="hangup")
    out, _ = run_judge(sim, verdict("abandoned", False))

    assert out["outcome"] == "abandoned" and out["goal_met"] is False
