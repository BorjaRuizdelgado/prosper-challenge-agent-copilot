import json

import pytest

from copilot.events import DraftTracker, node_for_edit, step_for_tool, validation_step

AGENT = {
    "name": "Clinic",
    "initial_node": "greeting",
    "nodes": [
        {
            "name": "greeting",
            "task_messages": ["Greet the caller."],
            "edges": [{"function": "go", "description": "When greeted.", "target": "offer_times"}],
        },
        {"name": "offer_times", "task_messages": ["Offer two slots."], "end": False},
    ],
}
TEXT = json.dumps(AGENT, indent=2)


def test_edit_in_a_node_names_that_node():
    assert node_for_edit(TEXT, "Offer two slots.") == "offer_times"
    assert node_for_edit(TEXT, "Greet the caller.") == "greeting"


def test_edit_inside_an_edge_names_the_owning_node():
    assert node_for_edit(TEXT, '"target": "offer_times"') == "greeting"


def test_edit_spanning_the_node_name_names_that_node():
    assert node_for_edit(TEXT, '"name": "offer_times"') == "offer_times"


def test_edit_outside_nodes_has_no_node():
    assert node_for_edit(TEXT, '"initial_node": "greeting"') is None
    assert node_for_edit(TEXT, '"name": "Clinic"') is None  # the agent's name is not a node


def test_unknown_or_empty_old_string_has_no_node():
    assert node_for_edit(TEXT, "not in the file") is None
    assert node_for_edit(TEXT, "") is None
    assert node_for_edit("{not json", "x") is None


def test_edit_step_carries_the_node():
    step = step_for_tool("Edit", {"old_string": "Offer two slots."}, TEXT)
    assert step == {"label": "Editing offer_times", "node": "offer_times"}


def test_edit_step_falls_back_to_the_agent():
    assert step_for_tool("Edit", {"old_string": '"initial_node": "greeting"'}, TEXT) == {"label": "Editing agent"}


@pytest.mark.parametrize(
    "tool, tool_input, label",
    [
        ("Read", {"file_path": "/w/drafts/clinic.json"}, "Reading agent"),
        ("Read", {"file_path": "/w/.claude/skills/prosper-blueprints/SKILL.md"}, "Reading skill"),
        ("Write", {"file_path": "/w/drafts/clinic.json"}, "Writing agent"),
        ("Skill", {"skill": "prosper-blueprints"}, "Loading Prosper Blueprints"),
        ("Skill", {"skill": "prosper-run-review"}, "Loading run review"),
    ],
)
def test_other_step_labels(tool, tool_input, label):
    assert step_for_tool(tool, tool_input, TEXT) == {"label": label}


def test_silent_and_validation_tools_have_no_step():
    assert step_for_tool("ToolSearch", {"query": "select:x"}, TEXT) is None
    assert step_for_tool("mcp__copilot__validate_agent", {}, TEXT) is None


def test_validation_step_uses_the_first_line():
    assert validation_step("0 issues") == {"label": "Validating: 0 issues"}
    assert validation_step("2 issues\nerror x at node a: y") == {"label": "Validating: 2 issues"}
    assert validation_step("") == {"label": "Validating: no result"}


def test_draft_tracker_skips_unparseable_unchanged_and_non_object_drafts():
    tracker = DraftTracker(AGENT)
    assert tracker.next_draft(TEXT) is None  # same as the base
    assert tracker.next_draft('{"name": ') is None  # mid-edit, not JSON
    assert tracker.next_draft("[]") is None
    changed = {**AGENT, "name": "Renamed"}
    assert tracker.next_draft(json.dumps(changed)) == changed
    assert tracker.next_draft(json.dumps(changed)) is None  # already sent
    assert tracker.next_draft(TEXT) == AGENT  # reverting is a change from the last sent


def test_findings_step_counts_the_findings():
    assert step_for_tool("mcp__copilot__report_findings", {"findings": [{}, {}]}, "") == {"label": "Reporting 2 findings"}
    assert step_for_tool("mcp__copilot__report_findings", {"findings": [{}]}, "") == {"label": "Reporting 1 finding"}


def test_coverage_step_counts_covered_and_default_requirements():
    reqs = [{"status": "covered"}, {"status": "default"}, {"status": "open"}]
    assert step_for_tool("mcp__copilot__report_coverage", {"requirements": reqs}, "") == {"label": "Reporting coverage (2/3)"}
