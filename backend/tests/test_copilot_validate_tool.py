import json

import pytest

from copilot import workspace
from copilot.validate_tool import FULL_COVERAGE_TOOL_NAME, FULL_FINDINGS_TOOL_NAME, FULL_TOOL_NAME, build_server, coverage_report, findings_report, validation_report

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


def finding(runs, **extra):
    return {"title": "Callers cannot cancel", "runs": runs, "cause": "No cancel path.", "fix": "Add one.", **extra}


@pytest.fixture
def runs_dir(tmp_path, monkeypatch):
    path = tmp_path / "runs-data"
    path.mkdir()
    monkeypatch.setenv("RUNS_DIR", str(path))
    run = {"id": "r-1", "started_at": "2026-10-21T09:14:00Z", "duration_s": 30, "outcome": "stuck", "transcript": [], "path": []}
    (path / "clinic.json").write_text(json.dumps([run, {**run, "id": "r-2"}]))


def test_findings_citing_known_runs_are_recorded(runs_dir):
    assert findings_report("clinic", [finding(["r-1", "r-2"], node="a"), finding(["r-2"])]) == ("Recorded 2 findings", False)
    assert findings_report("clinic", [finding(["r-1"])]) == ("Recorded 1 finding", False)


def test_unknown_run_ids_are_listed_with_the_known_ones(runs_dir):
    text, is_error = findings_report("clinic", [finding(["r-1", "r-9"]), finding(["r-7"])])
    assert is_error and text == "Unknown run ids: r-7, r-9. This agent's runs are: r-1, r-2."


def test_no_findings_is_recorded_as_zero(runs_dir):
    assert findings_report("clinic", []) == ("Recorded 0 findings", False)


def test_findings_for_an_agent_without_runs_are_rejected(runs_dir):
    text, is_error = findings_report("other", [finding(["r-1"])])
    assert is_error and "none" in text


def test_server_registers_both_tools():
    assert FULL_FINDINGS_TOOL_NAME == "mcp__copilot__report_findings"


def req(id, status="covered", nodes=("a",), **extra):
    return {"id": id, "text": f"Requirement {id}", "quote": "q", "status": status, "nodes": list(nodes), **extra}


def question(id="q1", requirements=("r2",)):
    return {"id": id, "question": "Which?", "default": "Hand off.", "requirements": list(requirements)}


@pytest.fixture
def clean_draft():
    workspace.write_draft("clinic", CLEAN)


def test_valid_coverage_is_recorded(clean_draft):
    text, is_error = coverage_report("clinic", [req("r1"), req("r2", "default", ["a", "b"]), req("r3", "open", [])], [question()])
    assert not is_error and text == "Recorded coverage: 2 of 3 requirements, 1 question"


def test_coverage_with_no_questions(clean_draft):
    assert coverage_report("clinic", [req("r1")], []) == ("Recorded coverage: 1 of 1 requirements, 0 questions", False)


def test_coverage_naming_an_unknown_node_lists_the_draft_nodes(clean_draft):
    text, is_error = coverage_report("clinic", [req("r1", nodes=["a", "nope"])], [])
    assert is_error and "r1" in text and "nope" in text and "a, b" in text


def test_duplicate_requirement_ids_are_rejected(clean_draft):
    text, is_error = coverage_report("clinic", [req("r1"), req("r1")], [])
    assert is_error and "Duplicate requirement id r1" in text


def test_covered_or_default_without_a_node_is_rejected(clean_draft):
    text, is_error = coverage_report("clinic", [req("r1", nodes=[]), req("r2", "default", [])], [question()])
    assert is_error and "r1 is covered but names no node" in text and "r2 is default but names no node" in text


def test_a_default_without_a_question_is_rejected(clean_draft):
    text, is_error = coverage_report("clinic", [req("r1", "default")], [])
    assert is_error and "r1 is a default but no question asks about it" in text


def test_a_question_about_an_unknown_requirement_is_rejected(clean_draft):
    text, is_error = coverage_report("clinic", [req("r1")], [question(requirements=["r9"])])
    assert is_error and "unknown requirement r9" in text


def test_an_invalid_status_is_rejected(clean_draft):
    text, is_error = coverage_report("clinic", [req("r1", "maybe")], [])
    assert is_error and "maybe" in text


def test_coverage_without_a_draft_is_an_error():
    assert coverage_report("clinic", [req("r1")], [])[1]


def test_server_registers_the_coverage_tool():
    assert FULL_COVERAGE_TOOL_NAME == "mcp__copilot__report_coverage"
