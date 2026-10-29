import pytest

from copilot import workspace
from copilot.validate_tool import FULL_TOOL_NAME, build_server, validation_report

CLEAN = {
    "name": "Clinic",
    "initial_node": "a",
    "nodes": [
        {
            "name": "a",
            "task_messages": ["Greet."],
            "edges": [{"function": "go", "description": "When done.", "target": "b"}],
        },
        {"name": "b", "task_messages": ["Say goodbye."], "end": True},
    ],
}


@pytest.fixture(autouse=True)
def copilot_workspace(tmp_path, monkeypatch):
    monkeypatch.setenv("COPILOT_WORKSPACE", str(tmp_path))


def test_clean_draft_has_zero_issues():
    workspace.write_draft("clinic", CLEAN)
    assert validation_report("clinic") == "0 issues"


def test_dangling_target_is_one_line_with_node_and_edge():
    broken = {**CLEAN, "nodes": [{**CLEAN["nodes"][0], "edges": [{**CLEAN["nodes"][0]["edges"][0], "target": "nope"}]}, CLEAN["nodes"][1]]}
    workspace.write_draft("clinic", broken)
    lines = validation_report("clinic").splitlines()
    assert lines[0] == f"{len(lines) - 1} issue" + ("" if len(lines) == 2 else "s")
    errors = [line for line in lines[1:] if line.startswith("error")]
    assert any("at node a edge go" in line and "nope" in line for line in errors)


def test_broken_json_is_a_parse_error():
    workspace.write_draft("clinic", CLEAN).write_text('{"name": ', encoding="utf-8")
    report = validation_report("clinic")
    assert report.startswith("error invalid-json") and "line 1" in report


def test_non_object_json_is_reported():
    workspace.write_draft("clinic", CLEAN).write_text("[]", encoding="utf-8")
    assert validation_report("clinic").startswith("error invalid-json")


def test_missing_draft_is_reported():
    assert validation_report("clinic").startswith("error draft-missing")


def test_server_registers_the_tool_under_its_full_name():
    server = build_server("clinic")
    assert server["type"] == "sdk" and server["name"] == "copilot"
    assert FULL_TOOL_NAME == "mcp__copilot__validate_agent"
