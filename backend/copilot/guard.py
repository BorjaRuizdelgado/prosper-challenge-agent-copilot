#
# Path guard for the copilot's file tools (design Decision 3). Pure function: the SDK
# hook in the runner calls it with the tool name and the path Claude Code asked for.
#

from pathlib import Path

from copilot import workspace

READ_TOOLS = {"Read"}
WRITE_TOOLS = {"Edit", "Write"}


def check_path(tool: str, file_path: str, agent_id: str) -> tuple[bool, str]:
    """Allow Read/Edit/Write on the agent's draft, Read on the agent's runs and guidelines files, and Read under the skills directory.

    Returns (allowed, reason); the reason is what the model sees on a denial. Paths are
    resolved first (relative ones against the workspace, `..` and symlinks followed), so
    only the real location counts.
    """
    if tool not in READ_TOOLS | WRITE_TOOLS:
        return False, f"Tool {tool} is not available."
    if not isinstance(file_path, str) or not file_path:
        return False, "A file path is required."

    root = workspace.workspace_dir().resolve()
    path = Path(file_path)
    resolved = (path if path.is_absolute() else root / path).resolve()

    # Resolve the directory only: resolving the draft itself would follow a symlink swapped in for it.
    draft = workspace.drafts_dir().resolve() / workspace.draft_path(agent_id).name
    runs = workspace.runs_dir().resolve() / workspace.runs_path(agent_id).name
    guidelines = workspace.guidelines_dir().resolve() / workspace.guidelines_path(agent_id).name
    skills = workspace.skills_dir().resolve()
    if resolved == draft:
        return True, ""
    if resolved == runs:
        if tool in READ_TOOLS:
            return True, ""
        return False, "The production runs are read-only."
    if resolved == guidelines:
        if tool in READ_TOOLS:
            return True, ""
        return False, "The client's guidelines are read-only."
    if resolved.is_relative_to(workspace.guidelines_dir().resolve()):
        return False, "You can only read the current agent's guidelines."
    if resolved.is_relative_to(workspace.runs_dir().resolve()):
        return False, "You can only read the current agent's production runs."
    if resolved.is_relative_to(skills):
        if tool in READ_TOOLS:
            return True, ""
        return False, "The skill files are read-only."
    return False, f"You can only use {tool} on the current agent's draft ({draft.name})."
