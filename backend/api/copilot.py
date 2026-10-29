"""Copilot endpoints (design Decision 6): one turn streamed as server-sent events."""

import json
from typing import AsyncIterator, Callable

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from copilot import runner

from .store import validate_agent_id

router = APIRouter(prefix="/api/copilot")

# The runner is injected so endpoint tests use a fake and need no Claude login.
Runner = Callable[[str, str, dict], AsyncIterator[dict]]

# Agent ids with a turn in flight: a second turn on the same agent is rejected (design Decision 7).
_busy: dict[str, object] = {}  # agent id -> token of the turn holding it


def _release(agent_id: str, token: object) -> None:
    if _busy.get(agent_id) is token:  # never release a newer turn's hold
        del _busy[agent_id]


def get_runner() -> Runner:
    return runner.run_turn


class Turn(BaseModel):
    message: str = Field(min_length=1)
    agent: dict


def sse(event: dict) -> str:
    return f"event: {event['event']}\ndata: {json.dumps(event['data'], ensure_ascii=False)}\n\n"


async def stream_turn(events: AsyncIterator[dict], agent_id: str, token: object) -> AsyncIterator[str]:
    """Relay runner events as SSE. If the client goes away the generator is closed, which closes
    the runner (it interrupts Claude Code) and, in `finally`, releases the agent."""
    try:
        async for event in events:
            yield sse(event)
    except Exception as e:  # a runner bug must reach the client as an event, not a broken stream
        yield sse({"event": "error", "data": {"message": f"The copilot failed: {e}"}})
    finally:
        await events.aclose()
        _release(agent_id, token)


@router.post("/{agent_id}")
async def copilot_turn(agent_id: str, body: Turn, run: Runner = Depends(get_runner)):
    validate_agent_id(agent_id)
    if agent_id in _busy:
        raise HTTPException(status_code=409, detail="The copilot is already working on this agent.")
    token = object()
    _busy[agent_id] = token
    return StreamingResponse(
        stream_turn(run(agent_id, body.message, body.agent), agent_id, token),
        media_type="text/event-stream",
        # No caching, and tell proxies (nginx-style) not to buffer: events must arrive one by one.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        # Backstop if the body is never iterated (client gone before the first chunk).
        background=BackgroundTask(_release, agent_id, token),
    )


@router.post("/{agent_id}/reset", status_code=204)
def copilot_reset(agent_id: str) -> None:
    runner.reset_session(validate_agent_id(agent_id))
