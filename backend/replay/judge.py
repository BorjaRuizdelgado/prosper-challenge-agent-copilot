"""The judge: scores a replay against the caller's goal (design Decision 3)."""

import json

from .client import ChatClient
from .simulator import SimResult

JUDGE_MODEL = "gpt-4o-mini"
OUTCOMES = ["completed", "transferred", "abandoned", "stuck"]

SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "replay_verdict",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "outcome": {"type": "string", "enum": OUTCOMES},
                "goal_met": {"type": "boolean"},
                "reason": {"type": "string"},
            },
            "required": ["outcome", "goal_met", "reason"],
            "additionalProperties": False,
        },
    },
}

SYSTEM = """You judge a simulated phone call between a clinic's voice agent and a caller.
Decide whether the caller's goal was met and how the call ended:
- completed: the agent finished the task or answered the question.
- transferred: the caller was handed to a human or told to call emergency services.
- abandoned: the caller gave up or hung up without the goal being met.
- stuck: the call went nowhere (loops, dead end).
Give a one-sentence reason that cites what happened."""

ENDINGS = {
    "end": "The agent ended the call.",
    "hangup": "The caller hung up.",
    "stuck": "The call hit the turn limit without ending.",
}


def _text(transcript: list) -> str:
    return "\n".join(f"{t['speaker']}: {t['text']}" for t in transcript)


def emergency_hangup(sim: SimResult) -> bool:
    """The agent told the caller to use emergency services and the caller hung up."""
    if sim.ended != "hangup":
        return False
    agent_text = " ".join(t["text"].lower() for t in sim.transcript if t["speaker"] == "agent")
    return "emergency services" in agent_text or "911" in agent_text


async def judge(goal: str, original: list, sim: SimResult, chat_client: ChatClient) -> dict:
    user = (
        f"Caller's goal: {goal}\n\nOriginal call:\n{_text(original)}\n\n"
        f"Replayed call:\n{_text(sim.transcript)}\n\nHow it ended: {ENDINGS[sim.ended]}"
    )
    out = await chat_client.chat(
        model=JUDGE_MODEL,
        messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
        temperature=0,
        response_format=SCHEMA,
    )
    verdict = json.loads(out.content)
    verdict = {"outcome": verdict["outcome"], "goal_met": bool(verdict["goal_met"]), "reason": verdict["reason"]}
    if sim.ended == "stuck":
        verdict["outcome"], verdict["goal_met"] = "stuck", False
    elif emergency_hangup(sim):
        verdict["outcome"], verdict["goal_met"] = "transferred", True
    return verdict
