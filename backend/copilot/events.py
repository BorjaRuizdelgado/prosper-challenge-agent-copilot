#
# Pure helpers behind the copilot's event stream (design Decision 6): what a tool call
# is called in the UI, which node an edit touches, and when a draft is worth sending.
#

import json
import re
from typing import Optional

from copilot.validate_tool import FULL_TOOL_NAME

NAME_RE = re.compile(r'"name"\s*:\s*"((?:[^"\\]|\\.)*)"')

# Tool calls that are not worth a line in the UI (the CLI looks up deferred tools first).
SILENT_TOOLS = {"ToolSearch"}


def node_names(draft_text: str) -> list[str]:
    """Node names in a draft, or [] when it does not parse."""
    try:
        nodes = json.loads(draft_text).get("nodes", [])
        return [n["name"] for n in nodes if isinstance(n, dict) and isinstance(n.get("name"), str)]
    except (ValueError, AttributeError):
        return []


def node_for_edit(draft_text: str, old_string: str) -> Optional[str]:
    """The node an Edit touches: the closest node name at or before `old_string` in the file.

    Node names are matched against the draft's real nodes, so the agent's own top-level
    "name" and edge fields never count. None when the text is not found.
    """
    start = draft_text.find(old_string) if old_string else -1
    if start < 0:
        return None
    known = set(node_names(draft_text))
    found = None
    for match in NAME_RE.finditer(draft_text):
        if match.start() > start + len(old_string):
            break
        if match.group(1) in known:
            found = match.group(1)
    return found


def step_for_tool(tool: str, tool_input: dict, draft_text: str) -> Optional[dict]:
    """The `step` event data for a tool call, or None when it should not be shown.

    The validation line is produced from the tool's result instead (see `validation_step`).
    """
    if tool in SILENT_TOOLS or tool == FULL_TOOL_NAME:
        return None
    if tool == "Read":
        path = str(tool_input.get("file_path", ""))
        return {"label": "Reading skill" if "/skills/" in path else "Reading agent"}
    if tool == "Edit":
        node = node_for_edit(draft_text, str(tool_input.get("old_string", "")))
        return {"label": f"Editing {node}" if node else "Editing agent", **({"node": node} if node else {})}
    if tool == "Write":
        return {"label": "Writing agent"}
    if tool == "Skill":
        return {"label": "Loading Prosper Blueprints"}
    return {"label": f"Using {tool}"}


def validation_step(report: str) -> dict:
    """`Validating: 0 issues` from a validate_agent result (its first line)."""
    return {"label": f"Validating: {report.splitlines()[0] if report else 'no result'}"}


class DraftTracker:
    """Decides which draft files become `draft` events: they must parse and differ from the last one sent."""

    def __init__(self, base: dict):
        self._last = base

    def next_draft(self, text: str) -> Optional[dict]:
        try:
            draft = json.loads(text)
        except ValueError:
            return None
        if not isinstance(draft, dict) or draft == self._last:
            return None
        self._last = draft
        return draft
