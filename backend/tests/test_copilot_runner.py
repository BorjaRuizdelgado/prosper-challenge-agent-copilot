import json

import pytest
from claude_agent_sdk import (
    AssistantMessage,
    CLINotFoundError,
    ResultMessage,
    StreamEvent,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

from api import store
from copilot import runner, workspace

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


AGENT = {
    "name": "Clinic",
    "initial_node": "a",
    "nodes": [
        {"name": "a", "task_messages": ["Greet."], "edges": [{"function": "go", "description": "d", "target": "b"}]},
        {"name": "b", "task_messages": ["Bye."], "end": True},
    ],
}


def result(session="s1", is_error=False, text=None):
    return ResultMessage("success", 1, 1, is_error, 1, session, result=text)


def tool_use(id, name, **tool_input):
    return AssistantMessage([ToolUseBlock(id, name, tool_input)], "m")


def tool_result(id, content="ok", is_error=None):
    return UserMessage([ToolResultBlock(id, content, is_error)])


def text_delta(text):
    return StreamEvent("u", "s", {"type": "content_block_delta", "delta": {"type": "text_delta", "text": text}})


class FakeClient:
    """Plays a script of messages; a step can be a callable that edits the draft like Claude Code would."""

    instances = []

    def __init__(self, script, options):
        self.script, self.options = script, options
        self.prompt, self.interrupted = None, False
        FakeClient.instances.append(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def query(self, prompt):
        self.prompt = prompt

    async def receive_response(self):
        for step in self.script:
            if callable(step):
                step()
            else:
                yield step

    async def interrupt(self):
        self.interrupted = True


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("COPILOT_WORKSPACE", str(tmp_path))
    monkeypatch.setenv("AGENTS_DIR", str(tmp_path / "agents"))
    runner._sessions.clear()
    FakeClient.instances.clear()


async def collect(script, agent=AGENT, agent_id="clinic", message="do it"):
    return [e async for e in runner.run_turn(agent_id, message, agent, lambda options: FakeClient(script, options))]


def edit_draft(change):
    def apply():
        draft = workspace.read_draft("clinic")
        change(draft)
        workspace.draft_path("clinic").write_text(json.dumps(draft, indent=2))
    return apply


def names(events):
    return [e["event"] for e in events]


async def test_turn_with_a_change_streams_steps_text_draft_and_proposal():
    def retask(d):
        d["nodes"][1]["task_messages"] = ["Say goodbye."]

    events = await collect([
        tool_use("1", "Read", file_path="drafts/clinic.json"),
        tool_result("1"),
        text_delta("Changed "),
        tool_use("2", "Edit", old_string="Bye.", new_string="Say goodbye."),
        edit_draft(retask),
        tool_result("2"),
        tool_use("3", "mcp__copilot__validate_agent"),
        tool_result("3", [{"type": "text", "text": "0 issues"}]),
        text_delta("the goodbye."),
        result(),
    ])
    assert names(events) == ["step", "text", "step", "draft", "step", "text", "proposal", "done"]
    assert events[0]["data"] == {"label": "Reading agent"}
    assert events[1]["data"] == {"delta": "Changed "}
    assert events[2]["data"] == {"label": "Editing b", "node": "b"}
    assert events[3]["data"]["agent"]["nodes"][1]["task_messages"] == ["Say goodbye."]
    assert events[4]["data"] == {"label": "Validating: 0 issues"}
    assert events[-2]["data"]["agent"]["nodes"][1]["task_messages"] == ["Say goodbye."]
    assert events[-2]["data"]["issues"] == []
    assert runner._sessions["clinic"] == "s1"


async def test_no_change_means_no_proposal():
    events = await collect([text_delta("Nothing to change."), result()])
    assert names(events) == ["text", "done"]


async def test_prompt_names_the_draft_and_carries_the_message():
    await collect([result()], message="add a node")
    assert FakeClient.instances[0].prompt == "The agent draft is drafts/clinic.json.\n\nadd a node"
    assert workspace.read_draft("clinic") == AGENT


async def test_unchanged_or_unparseable_drafts_are_not_sent():
    def break_json():
        workspace.draft_path("clinic").write_text('{"name": ')

    events = await collect([
        tool_use("1", "Edit", old_string="x", new_string="y"),
        tool_result("1"),  # draft still equals the input
        tool_use("2", "Edit", old_string="x", new_string="y"),
        break_json,
        tool_result("2"),
        result(),
    ])
    assert "draft" not in names(events)
    assert names(events)[-1] == "error"  # the final draft does not parse: no proposal


async def test_failed_edit_sends_no_draft():
    events = await collect([tool_use("1", "Write", file_path="drafts/clinic.json", content="x"), tool_result("1", "denied", True), result()])
    assert names(events) == ["step", "done"]


async def test_proposal_lists_remaining_issues():
    def dangle(d):
        d["nodes"][0]["edges"][0]["target"] = "missing"

    events = await collect([tool_use("1", "Edit", old_string="b", new_string="missing"), edit_draft(dangle), tool_result("1"), result()])
    proposal = next(e for e in events if e["event"] == "proposal")
    assert any(i["severity"] == "error" for i in proposal["data"]["issues"])


async def test_second_turn_resumes_the_session():
    await collect([result("sess-9")])
    await collect([result("sess-9")])
    assert FakeClient.instances[0].options.resume is None
    assert FakeClient.instances[1].options.resume == "sess-9"
    runner.reset_session("clinic")
    await collect([result()])
    assert FakeClient.instances[2].options.resume is None


async def test_missing_cli_is_a_setup_error():
    class Missing(FakeClient):
        async def __aenter__(self):
            raise CLINotFoundError("no claude")

    events = [e async for e in runner.run_turn("clinic", "hi", AGENT, lambda o: Missing([], o))]
    assert events == [{"event": "error", "data": {"message": runner.SETUP_MESSAGE, "setup": True}}]


async def test_login_failure_is_a_setup_error():
    failed = AssistantMessage([], "m", error="authentication_failed")
    events = await collect([failed, result()])
    assert names(events) == ["error"] and events[0]["data"]["setup"] is True


async def test_sdk_error_result_is_an_error():
    events = await collect([result(is_error=True, text="boom")])
    assert events == [{"event": "error", "data": {"message": "boom"}}]
    assert "clinic" not in runner._sessions


async def test_closing_the_stream_interrupts_the_client():
    gen = runner.run_turn("clinic", "hi", AGENT, lambda o: FakeClient([text_delta("a"), text_delta("b"), result()], o))
    await gen.__anext__()
    await gen.aclose()
    assert FakeClient.instances[0].interrupted


async def test_options_confine_the_copilot():
    await collect([result()])
    options = FakeClient.instances[0].options
    assert options.setting_sources == ["project"]
    assert options.cwd == str(workspace.workspace_dir())
    assert options.allowed_tools == ["Skill", "mcp__copilot__validate_agent", "mcp__copilot__report_findings", "mcp__copilot__report_coverage"]
    assert "Bash" in options.disallowed_tools
    assert options.include_partial_messages is True


async def test_permission_callback_and_hook_apply_the_guard():
    await collect([result()])
    options = FakeClient.instances[0].options
    draft = str(workspace.draft_path("clinic"))
    assert (await options.can_use_tool("Edit", {"file_path": draft}, None)).behavior == "allow"
    assert (await options.can_use_tool("Read", {"file_path": "/etc/passwd"}, None)).behavior == "deny"
    assert (await options.can_use_tool("Skill", {}, None)).behavior == "allow"
    assert (await options.can_use_tool("Bash", {"command": "ls"}, None)).behavior == "deny"

    hook = options.hooks["PreToolUse"][0].hooks[0]
    assert await hook({"tool_name": "Read", "tool_input": {"file_path": draft}}, None, None) == {}
    denied = await hook({"tool_name": "Read", "tool_input": {"file_path": "/etc/passwd"}}, None, None)
    assert denied["hookSpecificOutput"]["permissionDecision"] == "deny"


def test_model_defaults_to_haiku_and_can_be_overridden(monkeypatch):
    monkeypatch.delenv("COPILOT_MODEL", raising=False)
    assert runner._options("demo").model == "haiku"
    monkeypatch.setenv("COPILOT_MODEL", "sonnet")
    assert runner._options("demo").model == "sonnet"


async def test_prompt_points_at_the_runs_file_of_an_agent_with_runs(tmp_path, monkeypatch):
    runs_dir = tmp_path / "runs-data"
    runs_dir.mkdir()
    run = {
        "id": "r-1", "started_at": "2026-10-21T09:14:00Z", "duration_s": 30, "outcome": "stuck",
        "transcript": [{"speaker": "caller", "text": "Hello?"}], "path": [{"node": "a"}],
    }
    (runs_dir / "clinic.json").write_text(json.dumps([run]))
    monkeypatch.setenv("RUNS_DIR", str(runs_dir))
    await collect([result()])
    assert FakeClient.instances[0].prompt == (
        "The agent draft is drafts/clinic.json. Its production runs are in runs/clinic.txt.\n\ndo it"
    )
    assert "run r-1 · stuck · 30s" in (workspace.workspace_dir() / "runs" / "clinic.txt").read_text()


async def test_no_runs_means_no_file_no_prompt_line_and_no_stale_file(tmp_path, monkeypatch):
    monkeypatch.setenv("RUNS_DIR", str(tmp_path / "none"))
    stale = workspace.runs_path("clinic")
    stale.parent.mkdir(parents=True)
    stale.write_text("old")
    await collect([result()])
    assert not stale.exists()
    assert "production runs" not in FakeClient.instances[0].prompt


FINDINGS = [{"title": "Callers cannot cancel", "runs": ["r-1"], "cause": "No cancel path.", "fix": "Add one.", "node": "a"}]


async def test_findings_are_sent_after_their_step_and_before_the_proposal():
    def retask(d):
        d["nodes"][1]["task_messages"] = ["Say goodbye."]

    events = await collect([
        tool_use("1", "mcp__copilot__report_findings", findings=FINDINGS),
        tool_result("1", [{"type": "text", "text": "Recorded 1 finding"}]),
        tool_use("2", "Edit", old_string="Bye.", new_string="Say goodbye."),
        edit_draft(retask),
        tool_result("2"),
        result(),
    ])
    assert names(events) == ["step", "findings", "step", "draft", "proposal", "done"]
    assert events[0]["data"] == {"label": "Reporting 1 finding"}
    assert events[1]["data"] == {"findings": FINDINGS}


async def test_a_rejected_findings_call_sends_no_findings_and_the_retry_wins():
    corrected = [{**FINDINGS[0], "runs": ["r-2"]}]
    events = await collect([
        tool_use("1", "mcp__copilot__report_findings", findings=FINDINGS),
        tool_result("1", "Unknown run ids: r-1.", True),
        tool_use("2", "mcp__copilot__report_findings", findings=corrected),
        tool_result("2", "Recorded 1 finding"),
        result(),
    ])
    assert names(events) == ["step", "step", "findings", "done"]
    assert events[2]["data"] == {"findings": corrected}


async def test_prompt_points_at_the_guidelines_file_of_an_agent_with_guidelines(tmp_path, monkeypatch):
    store.save_guidelines("clinic", "# Maple\nBook visits.")
    await collect([result()])
    assert FakeClient.instances[0].prompt == (
        "The agent draft is drafts/clinic.json. The client's guidelines are in guidelines/clinic.md.\n\ndo it"
    )
    assert (workspace.workspace_dir() / "guidelines" / "clinic.md").read_text() == "# Maple\nBook visits."


async def test_no_guidelines_means_no_file_no_prompt_line_and_no_stale_file(tmp_path, monkeypatch):
    stale = workspace.guidelines_path("clinic")
    stale.parent.mkdir(parents=True)
    stale.write_text("old")
    await collect([result()])
    assert not stale.exists()
    assert "guidelines" not in FakeClient.instances[0].prompt


COVERAGE = {
    "requirements": [
        {"id": "r1", "text": "Greet", "quote": "q", "status": "covered", "nodes": ["a"]},
        {"id": "r2", "text": "Cancel", "quote": "", "status": "default", "nodes": ["b"]},
    ],
    "questions": [{"id": "q1", "question": "Cancel window?", "default": "Hand off.", "requirements": ["r2"]}],
}


async def test_coverage_event_order_is_step_coverage_proposal_done():
    def retask(d):
        d["nodes"][1]["task_messages"] = ["Say goodbye."]

    events = await collect([
        tool_use("1", "Edit", old_string="Bye.", new_string="Say goodbye."),
        edit_draft(retask),
        tool_result("1"),
        tool_use("2", "mcp__copilot__report_coverage", **COVERAGE),
        tool_result("2", [{"type": "text", "text": "Recorded coverage: 2 of 2 requirements, 1 question"}]),
        result(),
    ])
    assert names(events) == ["step", "draft", "step", "coverage", "proposal", "done"]
    assert events[2]["data"] == {"label": "Reporting coverage (2/2)"}
    assert events[3]["data"] == COVERAGE


async def test_a_rejected_coverage_call_sends_no_coverage_and_the_retry_wins():
    corrected = {**COVERAGE, "questions": []}
    events = await collect([
        tool_use("1", "mcp__copilot__report_coverage", **COVERAGE),
        tool_result("1", "Requirement r2 is a default but no question asks about it.", True),
        tool_use("2", "mcp__copilot__report_coverage", **corrected),
        tool_result("2", "Recorded coverage"),
        result(),
    ])
    assert names(events) == ["step", "step", "coverage", "done"]
    assert events[2]["data"] == corrected


def test_the_coverage_tool_is_allowed_without_a_prompt():
    assert "mcp__copilot__report_coverage" in runner._options("clinic").allowed_tools
