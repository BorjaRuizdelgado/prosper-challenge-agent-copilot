import json

import pytest

from agent_builder import AgentBuilder, validate
from agent_builder.schema import AgentConfig
from api import store


TASK = [{"role": "developer", "content": "t"}]


def node(name, edges=(), end=False):
    return {"name": name, "task_messages": TASK, "edges": list(edges), "end": end}


def edge(function, target, **extra):
    return {"function": function, "description": "d", "target": target, **extra}


def codes(data):
    return sorted((i.code, i.node, i.edge) for i in validate(data))


def agent(*edges):
    """An agent `a -> b` whose only edges out of `a` are `edges`; `b` ends the call."""
    return {"name": "x", "initial_node": "a", "nodes": [node("a", edges), node("b", end=True)]}


CASES = {
    "no nodes": ({"name": "x", "initial_node": "a", "nodes": []}, [("no-nodes", None, None)]),
    "bad initial": (
        {"name": "x", "initial_node": "zzz", "nodes": [node("a", end=True)]},
        [("bad-initial", None, None)],
    ),
    "unknown target": (
        {"name": "x", "initial_node": "a", "nodes": [node("a", [edge("go", "nope")]), node("b", end=True)]},
        [("unknown-target", "a", "go"), ("unreachable", "b", None)],
    ),
    "duplicate node": (
        {"name": "x", "initial_node": "a", "nodes": [node("a", end=True), node("a", end=True)]},
        [("duplicate-node", "a", None)],
    ),
    "duplicate function": (
        {
            "name": "x",
            "initial_node": "a",
            "nodes": [node("a", [edge("go", "b"), edge("go", "b")]), node("b", end=True)],
        },
        [("duplicate-function", "a", "go")],
    ),
    "unreachable": (
        {"name": "x", "initial_node": "a", "nodes": [node("a", end=True), node("b", end=True)]},
        [("unreachable", "b", None)],
    ),
    "no terminal": (
        {"name": "x", "initial_node": "a", "nodes": [node("a", [edge("loop", "a")])]},
        [("no-terminal", None, None)],
    ),
    "dead end": (
        {"name": "x", "initial_node": "a", "nodes": [node("a", [edge("go", "b")]), node("b")]},
        [("dead-end", "b", None), ("no-terminal", None, None)],
    ),
    "function name with spaces": (
        agent(edge("go to b", "b")),
        [("bad-function-name", "a", "go to b")],
    ),
    "function name too long": (
        agent(edge("f" * 65, "b")),
        [("bad-function-name", "a", "f" * 65)],
    ),
    "blank function name": (
        agent(edge("", "b")),
        [("missing-field", "a", None)],
    ),
    "edge without description": (
        agent({"function": "go", "target": "b"}),
        [("missing-field", "a", "go")],
    ),
    "edge without target": (
        agent({"function": "go", "description": "d"}),
        [("missing-field", "a", "go"), ("unreachable", "b", None)],
    ),
    "node without name": (
        {"name": "x", "initial_node": "a", "nodes": [node("a", end=True), {"task_messages": TASK}]},
        [("missing-field", None, None)],
    ),
    "agent without name": (
        {"initial_node": "a", "nodes": [node("a", end=True)]},
        [("missing-field", None, None)],
    ),
    "non-string initial node": (
        {"name": "x", "initial_node": ["a"], "nodes": [node("a", end=True)]},
        [("bad-initial", None, None)],
    ),
    "parameters of the wrong type": (
        agent(edge("go", "b", properties=[], required="zip")),
        [("bad-parameters", "a", "go")],
    ),
    "task messages not a list": (
        {"name": "x", "initial_node": "a", "nodes": [{**node("a", end=True), "task_messages": "hi"}]},
        [("bad-tasks", "a", None)],
    ),
    "required parameter not defined": (
        agent(edge("go", "b", properties={}, required=["zip"])),
        [("unknown-required", "a", "go")],
    ),
    "parameter without type": (
        agent(edge("go", "b", properties={"zip": {"description": "z"}})),
        [("untyped-parameter", "a", "go")],
    ),
    "node without task messages": (
        {"name": "x", "initial_node": "a", "nodes": [{"name": "a", "end": True}]},
        [("no-task", "a", None)],
    ),
}


@pytest.mark.parametrize("data,expected", CASES.values(), ids=CASES.keys())
def test_invalid_agents_report_expected_issues(data, expected):
    assert codes(data) == sorted(expected)


def test_severity_splits_errors_from_warnings():
    severities = {i.code: i.severity for i in validate(CASES["dead end"][0])}
    assert severities == {"dead-end": "warning", "no-terminal": "warning"}


def test_example_flow_has_no_issues():
    assert validate(json.loads(store.SEED_SOURCE.read_text())) == []


def test_malformed_documents_do_not_crash():
    assert [i.code for i in validate({"nodes": ["x", None]})] == ["no-nodes"]
    # Unhashable values where strings belong must be reported, not raise TypeError.
    weird = {"name": "x", "initial_node": {}, "nodes": [{"name": ["a"], "edges": [{"function": [], "target": {}}]}]}
    assert "missing-field" in {i.code for i in validate(weird)}


@pytest.mark.parametrize(
    "case",
    ["function name with spaces", "edge without description", "node without name", "agent without name"],
)
def test_new_errors_cover_documents_the_runtime_cannot_take(case):
    """Each of these used to pass validation; they are errors now, so the runner refuses them up front."""
    assert any(i.severity == "error" for i in validate(CASES[case][0]))


def test_new_rules_for_parameters_and_tasks_are_warnings():
    for case in ("required parameter not defined", "parameter without type", "node without task messages"):
        assert {i.severity for i in validate(CASES[case][0])} == {"warning"}, case


def test_validate_endpoint_handles_non_string_initial_node(client):
    res = client.post("/api/agents/validate", json=CASES["non-string initial node"][0])
    assert res.status_code == 200
    assert [i["code"] for i in res.json()] == ["bad-initial"]


def test_builder_raises_on_errors_but_not_warnings():
    with pytest.raises(ValueError, match="unknown node 'nope'"):
        AgentBuilder.from_dict({**CASES["unknown target"][0], "name": "x"})
    AgentBuilder.from_dict({**CASES["unreachable"][0], "name": "x"})


def test_schema_preserves_layout():
    config = AgentConfig.from_dict(
        {"name": "x", "initial_node": "a", "nodes": [], "layout": {"a": {"x": 1, "y": 2}}}
    )
    assert config.layout == {"a": {"x": 1, "y": 2}}


def test_validate_endpoint_returns_issue_dicts(client):
    res = client.post("/api/agents/validate", json=CASES["bad initial"][0])

    assert res.status_code == 200
    assert res.json() == [
        {
            "severity": "error",
            "code": "bad-initial",
            "message": "initial_node 'zzz' is not a defined node.",
            "node": None,
            "edge": None,
        }
    ]


def test_validate_endpoint_is_not_shadowed_by_agent_id_route(client):
    assert client.post("/api/agents/validate", json=json.loads(store.SEED_SOURCE.read_text())).json() == []
