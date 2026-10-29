"""Mocked production runs: read-only, one `<agent id>.json` list per agent in the runs directory."""

import json
import os
from pathlib import Path

from .store import BACKEND_DIR, validate_agent_id

DEFAULT_RUNS_DIR = BACKEND_DIR / "demo" / "runs"


def runs_dir() -> Path:
    return Path(os.environ.get("RUNS_DIR", DEFAULT_RUNS_DIR))


def list_runs(agent_id: str) -> list[dict]:
    """The agent's runs, newest first. An agent without a runs file has none."""
    path = runs_dir() / f"{validate_agent_id(agent_id)}.json"
    try:
        runs = json.loads(path.read_text())
    except FileNotFoundError:
        return []
    return sorted(runs, key=lambda r: r["started_at"], reverse=True)
