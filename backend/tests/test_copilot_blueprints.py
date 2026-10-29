import json

import pytest

from agent_builder.validation import validate
from copilot import workspace

BLUEPRINTS = sorted((workspace.skill_dir() / "blueprints").glob("*.json"))


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_the_three_blueprints_exist():
    assert {p.stem for p in BLUEPRINTS} == {"scheduling", "refills", "billing-faq"}


@pytest.mark.parametrize("path", BLUEPRINTS, ids=lambda p: p.stem)
def test_blueprint_validates_with_no_issues(path):
    # Blueprints are examples to copy, so hold them to no warnings either.
    assert validate(load(path)) == []


@pytest.mark.parametrize("path", BLUEPRINTS, ids=lambda p: p.stem)
def test_blueprint_follows_voice_conventions(path):
    agent = load(path)
    nodes = {n["name"]: n for n in agent["nodes"]}
    assert any(n.get("end") for n in nodes.values()), "needs an end node"
    # Emergency and human handoff are reachable from the greeting.
    targets = {e["target"] for e in nodes[agent["initial_node"]]["edges"]}
    assert {"emergency", "handoff"} <= targets
    assert "emergency services" in nodes["emergency"]["task_messages"][0]["content"]
    assert "medical advice" in agent["persona"]
    assert "layout" not in agent


@pytest.mark.parametrize("path", BLUEPRINTS, ids=lambda p: p.stem)
def test_skill_lists_blueprint(path):
    assert f"blueprints/{path.name}" in (workspace.skill_dir() / "SKILL.md").read_text(encoding="utf-8")
