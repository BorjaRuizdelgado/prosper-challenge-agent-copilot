"""FastAPI app for the agent builder UI. Run: uvicorn api.app:app --port 8000"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import store


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.seed_if_empty()
    yield


app = FastAPI(title="Agent builder API", lifespan=lifespan)


@app.get("/api/agents")
def list_agents() -> list[dict]:
    return store.list_agents()
