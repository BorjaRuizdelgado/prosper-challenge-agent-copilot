"""File-backed agent storage: one `<id>.json` per agent in the agents directory."""

import json
import os
import re
import secrets
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_AGENTS_DIR = BACKEND_DIR / "agents"
SEED_SOURCE = BACKEND_DIR / "example_flow.json"
SEED_ID = "prosper-scheduler"

AGENT_ID_RE = re.compile(r"^[a-z0-9-]{1,64}$")


class InvalidAgentId(ValueError):
    pass


class AgentNotFound(LookupError):
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
                "updated_at": datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).isoformat(),
            }
        )
    summaries.sort(key=lambda s: s["updated_at"], reverse=True)
    return summaries


def _updated_at(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).isoformat()


def _record(agent_id: str, path: Path, data: dict) -> dict:
    return {"id": agent_id, "agent": data, "updated_at": _updated_at(path)}


def _write_atomic(path: Path, data: dict) -> None:
    """Write via a temp file in the same directory so a failure never corrupts `path`."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def new_agent_id(name: str) -> str:
    """A slug of the name plus a 4-char random suffix, unique among stored agents."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40].strip("-") or "agent"
    while True:
        agent_id = f"{slug}-{secrets.token_hex(2)}"
        if not agent_path(agent_id).exists():
            return agent_id


def starter_agent(name: str) -> dict:
    return {
        "name": name,
        "persona": "",
        "initial_node": "greeting",
        "nodes": [
            {
                "name": "greeting",
                "task_messages": [{"role": "developer", "content": "Greet the caller and ask how you can help."}],
                "edges": [],
            }
        ],
    }


def get_agent(agent_id: str) -> dict:
    path = agent_path(agent_id)
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError:
        raise AgentNotFound(agent_id) from None
    return _record(agent_id, path, data)


def guidelines_path(agent_id: str) -> Path:
    return agents_dir() / f"{validate_agent_id(agent_id)}.guidelines.md"


def get_guidelines(agent_id: str) -> str | None:
    """The agent's client guidelines, or None when it has none."""
    try:
        return guidelines_path(agent_id).read_text()
    except FileNotFoundError:
        return None


def save_guidelines(agent_id: str, text: str) -> None:
    """Write the guidelines atomically, next to the agent's JSON."""
    path = guidelines_path(agent_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".md")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def create_agent(name: str, guidelines: str | None = None) -> dict:
    agent_id = new_agent_id(name)
    path = agent_path(agent_id)
    _write_atomic(path, starter_agent(name))
    if guidelines is not None:
        save_guidelines(agent_id, guidelines)
    return get_agent(agent_id)


def save_agent(agent_id: str, data: dict) -> dict:
    """Replace an existing agent's document."""
    path = agent_path(agent_id)
    if not path.exists():
        raise AgentNotFound(agent_id)
    _write_atomic(path, data)
    return get_agent(agent_id)


def duplicate_agent(agent_id: str) -> dict:
    data = get_agent(agent_id)["agent"]
    copy = {**data, "name": f"{data.get('name', agent_id)} copy"}
    new_id = new_agent_id(copy["name"])
    _write_atomic(agent_path(new_id), copy)
    guidelines = get_guidelines(agent_id)
    if guidelines is not None:
        save_guidelines(new_id, guidelines)
    return get_agent(new_id)


def delete_agent(agent_id: str) -> None:
    try:
        agent_path(agent_id).unlink()
    except FileNotFoundError:
        raise AgentNotFound(agent_id) from None
    guidelines_path(agent_id).unlink(missing_ok=True)
