#
# Session setup for bot.py: which agent a call runs and whether the keys exist.
# Kept free of Pipecat imports so it can be unit-tested without the voice stack.
#

import json
import os

from agent_builder import AgentBuilder, validate
from api.store import AgentNotFound, InvalidAgentId, get_agent

REQUIRED_KEYS = ("OPENAI_API_KEY", "ELEVENLABS_API_KEY")


class SessionError(Exception):
    """A call cannot start; the message is shown to whoever started it."""


def agent_id_from_body(body: dict | None) -> str:
    agent_id = (body or {}).get("agent_id")
    if not agent_id:
        raise SessionError("No agent selected: the session was started without an agent_id.")
    return agent_id


def load_agent(agent_id: str) -> AgentBuilder:
    """Load a saved agent for a call, refusing unknown ids and agents with blocking issues."""
    try:
        data = get_agent(agent_id)["agent"]
    except InvalidAgentId:
        raise SessionError(f"Invalid agent id: {agent_id!r}.") from None
    except AgentNotFound:
        raise SessionError(f"Unknown agent: '{agent_id}'. Save it in the editor first.") from None
    except json.JSONDecodeError:
        raise SessionError(f"Agent '{agent_id}' is not valid JSON.") from None

    if not isinstance(data, dict):
        raise SessionError(f"Agent '{agent_id}' must be a JSON object.")
    errors = [i for i in validate(data) if i.severity == "error"]
    if errors:
        raise SessionError(
            f"Agent '{agent_id}' has blocking issues: " + " ".join(i.message for i in errors)
        )
    try:
        return AgentBuilder.from_dict(data)
    except Exception as e:  # anything validation missed must still fail as a session error
        raise SessionError(f"Agent '{agent_id}' could not be built: {type(e).__name__}: {e}") from None


def check_keys() -> None:
    missing = [k for k in REQUIRED_KEYS if not os.environ.get(k)]
    if missing:
        raise SessionError(
            f"Missing API keys in backend/.env: {', '.join(missing)}. Add them and restart the runner."
        )


def node_changed_message(from_node: str | None, node: str, via: str | None, args: dict) -> dict:
    """The RTVI server message the editor listens to for highlighting the active node."""
    return {"type": "node_changed", "from": from_node, "node": node, "via": via, "args": args}
