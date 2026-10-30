"""Replay endpoint (design Decision 4): runs replayed before/after a proposal, streamed as SSE."""

import asyncio
import os
from typing import Awaitable, Callable

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from replay.runner import replay_run

from . import runs
from .copilot import sse
from .store import validate_agent_id

router = APIRouter(prefix="/api/agents")

MAX_PARALLEL = 4

# Injected so endpoint tests use a fake and never reach OpenAI. `on_line` is called with each transcript line as it happens.
ReplayFn = Callable[..., Awaitable[dict]]


def get_replay_fn() -> ReplayFn:
    return replay_run


class ReplayBody(BaseModel):
    base: dict
    proposal: dict | None = None  # omitted: replay against `base` only (the *Replay this call* button)
    run_ids: list[str] = Field(min_length=1)


async def stream_replay(jobs: list, fn: ReplayFn):
    """jobs: [(run, version, agent)]. Yields SSE strings; cancels pending jobs if closed."""
    queue: asyncio.Queue = asyncio.Queue()
    sem = asyncio.Semaphore(MAX_PARALLEL)

    async def work(run, version, agent):
        key = {"run_id": run["id"], "version": version}
        async with sem:
            await queue.put({"event": "started", "data": key})
            try:
                def on_line(line: dict) -> None:
                    queue.put_nowait({"event": "line", "data": {**key, **line}})

                result = await fn(agent, run, on_line=on_line)
                await queue.put({"event": "result", "data": {**key, **result}})
            except Exception as e:  # one failing job must not stop the others
                await queue.put({"event": "error", "data": {**key, "message": f"Replay failed: {e}", "setup": False}})

    tasks = [asyncio.create_task(work(*job)) for job in jobs]
    try:
        pending = asyncio.gather(*tasks)
        while not (pending.done() and queue.empty()):
            try:
                event = await asyncio.wait_for(queue.get(), timeout=0.05)
            except asyncio.TimeoutError:
                continue
            yield sse(event)
        yield sse({"event": "done", "data": {}})
    finally:
        for t in tasks:
            t.cancel()


@router.post("/{agent_id}/replay")
async def replay_endpoint(agent_id: str, body: ReplayBody, fn: ReplayFn = Depends(get_replay_fn)):
    available = {r["id"]: r for r in runs.list_runs(validate_agent_id(agent_id))}
    unknown = [rid for rid in body.run_ids if rid not in available]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown run ids: {', '.join(unknown)}")

    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    if not os.environ.get("OPENAI_API_KEY"):
        message = "Replay needs OPENAI_API_KEY in backend/.env."

        async def setup_error():
            yield sse({"event": "error", "data": {"message": message, "setup": True}})
            yield sse({"event": "done", "data": {}})

        return StreamingResponse(setup_error(), media_type="text/event-stream", headers=headers)

    jobs = [
        (available[rid], version, agent)
        for rid in dict.fromkeys(body.run_ids)
        for version, agent in (("before", body.base), ("after", body.proposal))
        if agent is not None
    ]
    return StreamingResponse(stream_replay(jobs, fn), media_type="text/event-stream", headers=headers)
