#
# The copilot's `validate_agent` tool: the same validator the editor's Issues tab uses,
# run on the agent's draft, reported as one line per issue so the model can fix them.
#

import json

from claude_agent_sdk import create_sdk_mcp_server, tool

from agent_builder.validation import Issue, validate
from copilot import workspace

SERVER_NAME = "copilot"
TOOL_NAME = "validate_agent"
FULL_TOOL_NAME = f"mcp__{SERVER_NAME}__{TOOL_NAME}"


def format_issue(issue: Issue) -> str:
    where = ""
    if issue.node:
        where = f" at node {issue.node}" + (f" edge {issue.edge}" if issue.edge else "")
    return f"{issue.severity} {issue.code}{where}: {issue.message}"


def format_issues(issues: list[Issue]) -> str:
    if not issues:
        return "0 issues"
    count = f"{len(issues)} issue" + ("" if len(issues) == 1 else "s")
    return f"{count}\n" + "\n".join(format_issue(i) for i in issues)


def validation_report(agent_id: str) -> str:
    """Validate the agent's draft file; a missing or non-JSON draft is reported, not raised."""
    try:
        draft = workspace.read_draft(agent_id)
    except FileNotFoundError:
        return "error draft-missing: The draft file does not exist."
    except json.JSONDecodeError as e:
        return f"error invalid-json: The draft is not valid JSON (line {e.lineno}, column {e.colno}): {e.msg}."
    if not isinstance(draft, dict):
        return "error invalid-json: The draft must be a JSON object."
    return format_issues(validate(draft))


def build_server(agent_id: str):
    """An in-process MCP server whose one tool validates this agent's draft."""

    @tool(TOOL_NAME, "Validate the agent draft with the editor's rules and list the issues.", {})
    async def validate_agent(_args) -> dict:
        return {"content": [{"type": "text", "text": validation_report(agent_id)}]}

    return create_sdk_mcp_server(name=SERVER_NAME, tools=[validate_agent])
