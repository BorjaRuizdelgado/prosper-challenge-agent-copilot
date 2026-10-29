"""File-backed agent storage: one `<id>.json` per agent in the agents directory."""

import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_AGENTS_DIR = BACKEND_DIR / "agents"
SEED_SOURCE = BACKEND_DIR / "example_flow.json"
SEED_ID = "prosper-scheduler"

AGENT_ID_RE = re.compile(r"^[a-z0-9-]{1,64}$")


class InvalidAgentId(ValueError):
    pass


def agents_dir() -> Path:
    return Path(os.environ.get("AGENTS_DIR", DEFAULT_AGENTS_DIR))


def validate_agent_id(agent_id: str) -> str:
    """Return the id if it is a safe file stem, else raise InvalidAgentId."""
    if not isinstance(agent_id, str) or not AGENT_ID_RE.fullmatch(agent_id):
        raise InvalidAgentId(f"Invalid agent id: {agent_id!r}")
    return agent_id


def agent_path(agent_id: str) -> Path:
    return agents_dir() / f"{validate_agent_id(agent_id)}.json"


def seed_if_empty() -> None:
    """Copy the example agent in when no agent exists yet, so the UI never starts blank."""
    directory = agents_dir()
    directory.mkdir(parents=True, exist_ok=True)
    if any(directory.glob("*.json")):
        return
    shutil.copyfile(SEED_SOURCE, directory / f"{SEED_ID}.json")


def list_agents() -> list[dict]:
    """Summaries of every valid agent file, newest first. Unreadable files are skipped."""
    summaries = []
    for path in agents_dir().glob("*.json"):
        if not AGENT_ID_RE.fullmatch(path.stem):
            continue
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        summaries.append(
            {
                "id": path.stem,
                "name": data.get("name", path.stem),
                "node_count": len(data.get("nodes", [])),
                "updated_at": datetime.fromtimestamp(
                    path.stat().st_mtime, tz=timezone.utc
                ).isoformat(),
            }
        )
    summaries.sort(key=lambda s: s["updated_at"], reverse=True)
    return summaries
