"""FastAPI app for the agent builder UI. Run: uvicorn api.app:app --port 8000"""

import json
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from agent_builder.validation import validate_as_dicts

from . import runs, store
from .copilot import router as copilot_router
from .replay import router as replay_router

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def load_env(path: Path = ENV_PATH) -> None:
    """Make backend/.env visible (OPENAI_API_KEY for replay), as bot.py does; real env vars win."""
    load_dotenv(path)


load_env()


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.seed_if_empty()
    yield


app = FastAPI(title="Agent builder API", lifespan=lifespan)
app.include_router(copilot_router)
app.include_router(replay_router)


@app.get("/api/agents")
def list_agents() -> list[dict]:
    return store.list_agents()


@app.post("/api/agents/validate")
def validate_agent(agent: dict) -> list[dict]:
    return validate_as_dicts(agent)


MAX_GUIDELINES_CHARS = 50_000  # ~50 KB of text
DEMO_GUIDELINES_DIR = Path(__file__).resolve().parent.parent / "demo" / "guidelines"


class NewAgent(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    guidelines: str | None = Field(default=None, max_length=MAX_GUIDELINES_CHARS)


class GuidelinesBody(BaseModel):
    text: str = Field(max_length=MAX_GUIDELINES_CHARS)


@app.exception_handler(store.InvalidAgentId)
def _invalid_id(_, exc: store.InvalidAgentId):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(store.AgentNotFound)
def _not_found(_, exc: store.AgentNotFound):
    return JSONResponse(status_code=404, content={"detail": f"Agent not found: {exc}"})


@app.post("/api/agents", status_code=201)
def create_agent(body: NewAgent) -> dict:
    return store.create_agent(body.name.strip(), body.guidelines)


@app.get("/api/agents/{agent_id}")
def get_agent(agent_id: str) -> dict:
    return store.get_agent(agent_id)


@app.get("/api/agents/{agent_id}/guidelines")
def get_guidelines(agent_id: str) -> dict:
    text = store.get_guidelines(agent_id)
    if text is None:
        raise HTTPException(status_code=404, detail="No guidelines for this agent")
    return {"text": text}


@app.put("/api/agents/{agent_id}/guidelines")
def put_guidelines(agent_id: str, body: GuidelinesBody) -> dict:
    store.get_agent(agent_id)  # 404 for an unknown agent
    store.save_guidelines(agent_id, body.text)
    return {"text": body.text}


@app.get("/api/demo/guidelines")
def sample_guidelines() -> list[dict]:
    """Sample client guidelines for *Use sample guidelines*. `reply` is the sample client reply."""
    samples = []
    for path in sorted(DEMO_GUIDELINES_DIR.glob("*.md")):
        if path.name.endswith(".reply.md"):
            continue
        sample = {"name": path.stem, "text": path.read_text()}
        reply = path.with_suffix(".reply.md")
        if reply.exists():
            sample["reply"] = reply.read_text()
        samples.append((_sample_order(path), sample))
    return [sample for _, sample in sorted(samples, key=lambda s: (s[0], s[1]["name"]))]


def _sample_order(path) -> int:
    """The `order` key of the sample's `.expected.json`; samples without one go last."""
    try:
        return int(json.loads(path.with_suffix(".expected.json").read_text()).get("order", 1000))
    except (OSError, ValueError, AttributeError):
        return 1000


@app.get("/api/agents/{agent_id}/runs")
def list_agent_runs(agent_id: str) -> list[dict]:
    return runs.list_runs(agent_id)


@app.put("/api/agents/{agent_id}")
def save_agent(agent_id: str, agent: dict) -> dict:
    return store.save_agent(agent_id, agent)


@app.post("/api/agents/{agent_id}/duplicate", status_code=201)
def duplicate_agent(agent_id: str) -> dict:
    return store.duplicate_agent(agent_id)


@app.delete("/api/agents/{agent_id}", status_code=204)
def delete_agent(agent_id: str) -> None:
    store.delete_agent(agent_id)
