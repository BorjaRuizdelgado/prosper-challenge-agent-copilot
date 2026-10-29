#
# The copilot's sandbox on disk. Claude Code edits one draft file per agent; the API
# writes the editor's working copy there before each turn and reads it back after.
# `.claude/skills/` is committed (the Prosper Blueprints skill); `drafts/` is scratch.
#

import json
import os
from pathlib import Path

from api.store import validate_agent_id

DEFAULT_WORKSPACE = Path(__file__).parent / "workspace"
SKILL_NAME = "prosper-blueprints"


def workspace_dir() -> Path:
    return Path(os.environ.get("COPILOT_WORKSPACE", DEFAULT_WORKSPACE))


def drafts_dir() -> Path:
    return workspace_dir() / "drafts"


def skill_dir() -> Path:
    return workspace_dir() / ".claude" / "skills" / SKILL_NAME


def draft_path(agent_id: str) -> Path:
    return drafts_dir() / f"{validate_agent_id(agent_id)}.json"


def dump_agent(agent: dict) -> str:
    """Stable pretty-printing: same input, same bytes, so `Edit` string matching is reliable."""
    return json.dumps(agent, indent=2, ensure_ascii=False) + "\n"


def write_draft(agent_id: str, agent: dict) -> Path:
    path = draft_path(agent_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dump_agent(agent), encoding="utf-8")
    return path


def read_draft(agent_id: str) -> dict:
    """The draft as parsed JSON. Raises FileNotFoundError or json.JSONDecodeError."""
    return json.loads(draft_path(agent_id).read_text(encoding="utf-8"))
