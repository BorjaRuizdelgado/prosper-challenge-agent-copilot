"""FastAPI app for the agent builder UI. Run: uvicorn api.app:app --port 8000"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from agent_builder.validation import validate_as_dicts

from . import runs, store
from .copilot import router as copilot_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.seed_if_empty()
    yield


app = FastAPI(title="Agent builder API", lifespan=lifespan)
app.include_router(copilot_router)


@app.get("/api/agents")
def list_agents() -> list[dict]:
    return store.list_agents()


@app.post("/api/agents/validate")
def validate_agent(agent: dict) -> list[dict]:
    return validate_as_dicts(agent)


class NewAgent(BaseModel):
    name: str = Field(min_length=1, max_length=80)


@app.exception_handler(store.InvalidAgentId)
def _invalid_id(_, exc: store.InvalidAgentId):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(store.AgentNotFound)
def _not_found(_, exc: store.AgentNotFound):
    return JSONResponse(status_code=404, content={"detail": f"Agent not found: {exc}"})


@app.post("/api/agents", status_code=201)
def create_agent(body: NewAgent) -> dict:
    return store.create_agent(body.name.strip())


@app.get("/api/agents/{agent_id}")
def get_agent(agent_id: str) -> dict:
    return store.get_agent(agent_id)


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
