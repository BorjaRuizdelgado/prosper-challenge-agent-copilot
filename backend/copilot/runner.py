#
# One copilot turn: write the editor's working copy to the agent's draft file, let Claude
# Code (through the Agent SDK) edit it, and stream what happens as events (design
# Decision 6). The API depends on `run_turn` only, so endpoint tests use a fake runner.
#

import os
import warnings
from typing import Any, AsyncIterator, Callable

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    CanUseToolShadowedWarning,
    CLIConnectionError,
    CLINotFoundError,
    HookMatcher,
    PermissionResultAllow,
    PermissionResultDeny,
    ProcessError,
    ResultMessage,
    StreamEvent,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

from agent_builder.validation import validate_as_dicts
from api.runs import list_runs
from api.store import get_guidelines
from copilot import workspace

# Cheapest tier by default; the CLI resolves the alias to the current Haiku. COPILOT_MODEL overrides it.
DEFAULT_MODEL = "haiku"
from copilot.events import DraftTracker, step_for_tool, validation_step
from copilot.guard import check_path
from copilot.validate_tool import FULL_FINDINGS_TOOL_NAME, FULL_TOOL_NAME, build_server

# Skill and validate_agent are allowed on purpose; the callback guards the file tools only.
warnings.filterwarnings("ignore", category=CanUseToolShadowedWarning)

Event = dict  # {"event": "step" | "text" | "findings" | "draft" | "proposal" | "done" | "error", "data": {...}}

SETUP_MESSAGE = (
    "The copilot needs Claude Code: install the `claude` CLI and log in with it, "
    "or set ANTHROPIC_API_KEY in the API's environment."
)
SETUP_ERRORS = {"authentication_failed", "billing_error"}
FILE_TOOLS = "Read|Edit|Write"
EDIT_TOOLS = {"Edit", "Write"}
# Claude Code tools the copilot never gets, even if the CLI's defaults change.
DISALLOWED_TOOLS = ["Bash", "BashOutput", "KillShell", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "NotebookEdit", "TodoWrite", "advisor"]

# agent id -> SDK session id, so a follow-up turn resumes the conversation (design Decision 7).
_sessions: dict[str, str] = {}


def reset_session(agent_id: str) -> None:
    _sessions.pop(agent_id, None)


def _event(name: str, **data) -> Event:
    return {"event": name, "data": data}


def _options(agent_id: str) -> ClaudeAgentOptions:
    async def can_use_tool(tool, tool_input, _context):
        if tool in FILE_TOOLS.split("|"):
            allowed, reason = check_path(tool, tool_input.get("file_path", ""), agent_id)
        else:
            allowed, reason = tool == "Skill", f"{tool} is not available."
        return PermissionResultAllow() if allowed else PermissionResultDeny(message=reason)

    async def guard_hook(hook_input, _tool_use_id, _context):
        # The enforcement point: can_use_tool never sees Read inside cwd (design Decision 3).
        allowed, reason = check_path(hook_input.get("tool_name", ""), hook_input.get("tool_input", {}).get("file_path", ""), agent_id)
        if allowed:
            return {}
        return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason}}

    return ClaudeAgentOptions(
        cwd=str(workspace.workspace_dir()),
        setting_sources=["project"],
        system_prompt=workspace.system_prompt(),
        mcp_servers={"copilot": build_server(agent_id)},
        # Read/Edit/Write must stay out of allowed_tools: those are auto-approved before any guard.
        allowed_tools=["Skill", FULL_TOOL_NAME, FULL_FINDINGS_TOOL_NAME],
        disallowed_tools=DISALLOWED_TOOLS,
        can_use_tool=can_use_tool,
        hooks={"PreToolUse": [HookMatcher(matcher=FILE_TOOLS, hooks=[guard_hook])]},
        include_partial_messages=True,
        resume=_sessions.get(agent_id),
        model=os.environ.get("COPILOT_MODEL") or DEFAULT_MODEL,
    )


def _text_delta(message: StreamEvent) -> str:
    event = message.event
    if message.parent_tool_use_id or event.get("type") != "content_block_delta":
        return ""
    delta = event.get("delta", {})
    return delta.get("text", "") if delta.get("type") == "text_delta" else ""


def _result_text(block: ToolResultBlock) -> str:
    if isinstance(block.content, list):
        return "\n".join(part.get("text", "") for part in block.content if isinstance(part, dict))
    return block.content or ""


def _read_text(agent_id: str) -> str:
    try:
        return workspace.draft_path(agent_id).read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def _setup_error() -> Event:
    return _event("error", message=SETUP_MESSAGE, setup=True)


async def run_turn(
    agent_id: str,
    message: str,
    agent: dict,
    client_factory: Callable[[ClaudeAgentOptions], Any] = ClaudeSDKClient,
) -> AsyncIterator[Event]:
    """Run one turn and yield events. `client_factory` is a seam for tests."""
    path = workspace.write_draft(agent_id, agent)
    tracker = DraftTracker(agent)
    tools: dict[str, str] = {}  # tool_use_id -> tool name
    findings_inputs: dict[str, dict] = {}  # tool_use_id -> report_findings input
    runs_file = workspace.write_runs(agent_id, list_runs(agent_id))
    prompt = f"The agent draft is {path.relative_to(workspace.workspace_dir())}."
    if runs_file:
        prompt += f" Its production runs are in {runs_file.relative_to(workspace.workspace_dir())}."
    guidelines_file = workspace.write_guidelines(agent_id, get_guidelines(agent_id))
    if guidelines_file:
        prompt += f" The client's guidelines are in {guidelines_file.relative_to(workspace.workspace_dir())}."
    prompt += f"\n\n{message}"
    finished = False

    try:
        async with client_factory(_options(agent_id)) as client:
            try:
                await client.query(prompt)
                async for msg in client.receive_response():
                    if isinstance(msg, StreamEvent):
                        if delta := _text_delta(msg):
                            yield _event("text", delta=delta)
                    elif isinstance(msg, AssistantMessage):
                        if msg.error in SETUP_ERRORS:
                            yield _setup_error()
                            return
                        for block in msg.content:
                            if isinstance(block, ToolUseBlock):
                                tools[block.id] = block.name
                                if block.name == FULL_FINDINGS_TOOL_NAME:
                                    findings_inputs[block.id] = block.input
                                if step := step_for_tool(block.name, block.input, _read_text(agent_id)):
                                    yield _event("step", **step)
                    elif isinstance(msg, UserMessage) and isinstance(msg.content, list):
                        for block in msg.content:
                            if not isinstance(block, ToolResultBlock):
                                continue
                            tool = tools.get(block.tool_use_id)
                            if tool == FULL_TOOL_NAME:
                                yield _event("step", **validation_step(_result_text(block)))
                            elif tool == FULL_FINDINGS_TOOL_NAME and not block.is_error:
                                yield _event("findings", findings=findings_inputs[block.tool_use_id].get("findings", []))
                            elif tool in EDIT_TOOLS and not block.is_error:
                                if draft := tracker.next_draft(_read_text(agent_id)):
                                    yield _event("draft", agent=draft)
                    elif isinstance(msg, ResultMessage):
                        if msg.is_error:
                            yield _event("error", message=msg.result or "The copilot failed.")
                            return
                        _sessions[agent_id] = msg.session_id
                finished = True
            finally:
                if not finished:
                    try:
                        await client.interrupt()  # client gone or turn failed: stop the CLI
                    except Exception:
                        pass  # the process may already have exited
    except (CLINotFoundError, CLIConnectionError):
        yield _setup_error()
        return
    except ProcessError as e:
        yield _event("error", message=str(e))
        return

    try:
        draft = workspace.read_draft(agent_id)
    except (FileNotFoundError, ValueError):
        draft = None
    if not isinstance(draft, dict):
        yield _event("error", message="The copilot left the agent in an unreadable state; your agent is unchanged.")
        return
    if draft != agent:
        yield _event("proposal", agent=draft, issues=validate_as_dicts(draft))
    yield _event("done")
