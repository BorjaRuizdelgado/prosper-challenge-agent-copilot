import json

import pytest

from agent_builder import AgentBuilder, validate
from agent_builder.schema import AgentConfig
from api import store


def node(name, edges=(), end=False):
    return {"name": name, "edges": list(edges), "end": end}


def edge(function, target):
    return {"function": function, "description": "d", "target": target}


def codes(data):
    return sorted((i.code, i.node, i.edge) for i in validate(data))


CASES = {
    "no nodes": ({"initial_node": "a", "nodes": []}, [("no-nodes", None, None)]),
    "bad initial": (
        {"initial_node": "zzz", "nodes": [node("a", end=True)]},
        [("bad-initial", None, None)],
    ),
    "unknown target": (
        {"initial_node": "a", "nodes": [node("a", [edge("go", "nope")]), node("b", end=True)]},
        [("unknown-target", "a", "go"), ("unreachable", "b", None)],
    ),
    "duplicate node": (
        {"initial_node": "a", "nodes": [node("a", end=True), node("a", end=True)]},
        [("duplicate-node", "a", None)],
    ),
    "duplicate function": (
        {
            "initial_node": "a",
            "nodes": [node("a", [edge("go", "b"), edge("go", "b")]), node("b", end=True)],
        },
        [("duplicate-function", "a", "go")],
    ),
    "unreachable": (
        {"initial_node": "a", "nodes": [node("a", end=True), node("b", end=True)]},
        [("unreachable", "b", None)],
    ),
    "no terminal": (
        {"initial_node": "a", "nodes": [node("a", [edge("loop", "a")])]},
        [("no-terminal", None, None)],
    ),
    "dead end": (
        {"initial_node": "a", "nodes": [node("a", [edge("go", "b")]), node("b")]},
        [("dead-end", "b", None), ("no-terminal", None, None)],
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
