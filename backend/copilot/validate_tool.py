#
# The copilot's in-process tools. `validate_agent`: the same validator the editor's Issues
# tab uses, run on the agent's draft, reported as one line per issue so the model can fix
# them. `report_findings`: what a review of production runs found, checked against the
# agent's runs (the runner forwards a successful call to the UI as a `findings` event).
#

import json

from claude_agent_sdk import create_sdk_mcp_server, tool

from agent_builder.validation import Issue, validate
from api.runs import list_runs
from copilot import workspace

SERVER_NAME = "copilot"
TOOL_NAME = "validate_agent"
FULL_TOOL_NAME = f"mcp__{SERVER_NAME}__{TOOL_NAME}"
FINDINGS_TOOL_NAME = "report_findings"
FULL_FINDINGS_TOOL_NAME = f"mcp__{SERVER_NAME}__{FINDINGS_TOOL_NAME}"

FINDINGS_SCHEMA = {
    "type": "object",
    "properties": {
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "The problem as callers experienced it."},
                    "runs": {"type": "array", "items": {"type": "string"}, "description": "Ids of the runs that show it."},
                    "cause": {"type": "string", "description": "What in the agent's graph causes it."},
                    "fix": {"type": "string", "description": "The intended change."},
                    "node": {"type": "string", "description": "The node the finding is about, if any."},
                },
                "required": ["title", "runs", "cause", "fix"],
            },
        }
    },
    "required": ["findings"],
}


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


def findings_report(agent_id: str, findings: list[dict]) -> tuple[str, bool]:
    """The tool's reply and whether it is an error: run ids that are not this agent's runs are listed so the model can correct them."""
    known = {run["id"] for run in list_runs(agent_id)}
    unknown = sorted({run_id for f in findings for run_id in f.get("runs", [])} - known)
    if unknown:
        return f"Unknown run ids: {', '.join(unknown)}. This agent's runs are: {', '.join(sorted(known)) or 'none'}.", True
    return f"Recorded {len(findings)} finding" + ("" if len(findings) == 1 else "s"), False


def build_server(agent_id: str):
    """An in-process MCP server with this agent's tools: validate the draft, report findings on its runs."""

    @tool(TOOL_NAME, "Validate the agent draft with the editor's rules and list the issues.", {})
    async def validate_agent(_args) -> dict:
        return {"content": [{"type": "text", "text": validation_report(agent_id)}]}

    @tool(FINDINGS_TOOL_NAME, "Report what the review of this agent's production runs found, one finding per cause, citing run ids.", FINDINGS_SCHEMA)
    async def report_findings(args) -> dict:
        text, is_error = findings_report(agent_id, args.get("findings", []))
        return {"content": [{"type": "text", "text": text}], "is_error": is_error}

    return create_sdk_mcp_server(name=SERVER_NAME, tools=[validate_agent, report_findings])
