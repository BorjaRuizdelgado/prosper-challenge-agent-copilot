"""The simulated caller, seeded from the original call (design Decision 2)."""

import json
from pathlib import Path

from .client import ChatClient

CALLER_MODEL = "gpt-4o-mini"
CALLER_TEMPERATURE = 0.4

PROMPT = """You are calling a clinic by phone. What you wanted: {goal}

What you said in the original call, in order:
{lines}

Rules:
- Answer briefly, as on the phone. Reply with only what you say out loud.
- Your original lines answered the old agent, so do not replay them in order. Answer what this agent asks now.
- Reuse the facts from your original lines when asked. If you are asked for your name or date of birth and gave none, make a plausible one up. Invent nothing else that matters.
- Push for your goal as the original caller did, but when the agent asks you for something you can give, give it.
- React to the agent as the original caller did: if it asks for several things in one message, you cannot hold them all: answer only the first one, or say you are not sure what it wants, and ask for a person if it keeps asking for everything at once, as in your original lines.
- If you are told to hang up and call emergency services, or that you are being transferred, say goodbye and output {hangup}. Also output {hangup} when you would give up."""

SUMMARY_PROMPT = (
    "In one short sentence, in the caller's own terms, state what the caller wanted "
    "in this phone call. Reply with the sentence only."
)


def caller_lines(run: dict) -> list:
    return [t["text"] for t in run.get("transcript", []) if t.get("speaker") == "caller"]


def build_prompt(run: dict, goal: str) -> str:
    lines = "\n".join(f"{i}. {text}" for i, text in enumerate(caller_lines(run), 1)) or "(the caller said nothing)"
    return PROMPT.format(goal=goal, lines=lines, hangup="[HANGUP]")


class Caller:
    """Plays the caller of ``run``; ``reply`` takes the transcript so far."""

    def __init__(self, run: dict, goal: str, chat_client: ChatClient):
        self.system = build_prompt(run, goal)
        self.chat_client = chat_client

    async def reply(self, transcript: list) -> str:
        # The agent is the "user" from the caller's point of view.
        messages = [{"role": "system", "content": self.system}]
        for turn in transcript:
            role = "assistant" if turn["speaker"] == "caller" else "user"
            messages.append({"role": role, "content": turn["text"]})
        out = await self.chat_client.chat(model=CALLER_MODEL, messages=messages, temperature=CALLER_TEMPERATURE)
        return (out.content or "").strip()


async def goal_for(run: dict, chat_client: ChatClient, cache_path: Path | None = None) -> str:
    """The run's own ``goal``, else a cached one-line summary of the call."""
    if run.get("goal"):
        return run["goal"]
    cache = {}
    if cache_path and cache_path.exists():
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        if run["id"] in cache:
            return cache[run["id"]]
    text = "\n".join(f"{t['speaker']}: {t['text']}" for t in run.get("transcript", []))
    out = await chat_client.chat(
        model=CALLER_MODEL,
        messages=[{"role": "system", "content": SUMMARY_PROMPT}, {"role": "user", "content": text}],
        temperature=0,
    )
    goal = (out.content or "").strip()
    if cache_path:
        cache[run["id"]] = goal
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(cache, indent=2), encoding="utf-8")
    return goal
