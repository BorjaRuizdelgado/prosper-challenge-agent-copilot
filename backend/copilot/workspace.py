#
# The copilot's sandbox on disk. Claude Code edits one draft file per agent; the API
# writes the editor's working copy there before each turn and reads it back after.
# `.claude/skills/` is committed (the Prosper Blueprints and run review skills); `drafts/`, `runs/` and `guidelines/` are scratch.
#

import json
import os
from pathlib import Path

from api.store import validate_agent_id
from copilot.runs_text import render_runs

DEFAULT_WORKSPACE = Path(__file__).parent / "workspace"
SKILL_NAME = "prosper-blueprints"
RUN_REVIEW_SKILL_NAME = "prosper-run-review"


def workspace_dir() -> Path:
    return Path(os.environ.get("COPILOT_WORKSPACE", DEFAULT_WORKSPACE))


def drafts_dir() -> Path:
    return workspace_dir() / "drafts"


def runs_dir() -> Path:
    return workspace_dir() / "runs"


def guidelines_dir() -> Path:
    return workspace_dir() / "guidelines"


def skills_dir() -> Path:
    return workspace_dir() / ".claude" / "skills"


def skill_dir(name: str = SKILL_NAME) -> Path:
    return skills_dir() / name


def draft_path(agent_id: str) -> Path:
    return drafts_dir() / f"{validate_agent_id(agent_id)}.json"


def runs_path(agent_id: str) -> Path:
    return runs_dir() / f"{validate_agent_id(agent_id)}.txt"


def guidelines_path(agent_id: str) -> Path:
    return guidelines_dir() / f"{validate_agent_id(agent_id)}.md"


def dump_agent(agent: dict) -> str:
    """Stable pretty-printing: same input, same bytes, so `Edit` string matching is reliable."""
    return json.dumps(agent, indent=2, ensure_ascii=False) + "\n"


def write_draft(agent_id: str, agent: dict) -> Path:
    path = draft_path(agent_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dump_agent(agent), encoding="utf-8")
    return path


def write_runs(agent_id: str, runs: list[dict]) -> Path | None:
    """Writes the agent's runs as text for the copilot to read; with no runs, removes a stale file and returns None."""
    path = runs_path(agent_id)
    if not runs:
        path.unlink(missing_ok=True)
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_runs(runs), encoding="utf-8")
    return path


def write_guidelines(agent_id: str, text: str | None) -> Path | None:
    """Writes the client's guidelines for the copilot to read; with none, removes a stale file and returns None."""
    path = guidelines_path(agent_id)
    if not text:
        path.unlink(missing_ok=True)
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def read_draft(agent_id: str) -> dict:
    """The draft as parsed JSON. Raises FileNotFoundError or json.JSONDecodeError."""
    return json.loads(draft_path(agent_id).read_text(encoding="utf-8"))


def system_prompt() -> str:
    return (Path(__file__).parent / "system_prompt.md").read_text(encoding="utf-8")
