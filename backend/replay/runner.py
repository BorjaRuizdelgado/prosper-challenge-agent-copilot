"""One replay job: a run played against one agent version, then judged."""

from pathlib import Path
from typing import Callable, Optional

from agent_builder.schema import AgentConfig

from .caller import Caller, goal_for
from .client import ChatClient, OpenAIChatClient
from .judge import judge
from .simulator import replay

GOAL_CACHE = Path(__file__).resolve().parent.parent / ".replay-cache" / "goals.json"


async def replay_run(agent: dict, run: dict, chat_client: ChatClient = None, on_line: Optional[Callable[[dict], None]] = None) -> dict:
    """Replay ``run`` against the agent dict; ``on_line`` sees each transcript line as it happens. Returns transcript, path, outcome, goal_met, reason."""
    client = chat_client or OpenAIChatClient()
    config = AgentConfig.from_dict(agent)
    goal = await goal_for(run, client, GOAL_CACHE)
    sim = await replay(config, Caller(run, goal, client), client, on_line=on_line)
    verdict = await judge(goal, run.get("transcript", []), sim, client)
    return {"transcript": sim.transcript, "path": sim.path, **verdict}
