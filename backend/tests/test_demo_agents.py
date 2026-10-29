import json
from pathlib import Path

import pytest

from agent_builder import validate

AGENTS = Path(__file__).resolve().parent.parent / "demo" / "agents"
IDS = ["demo-riverside-scheduler", "demo-sunrise-refills", "demo-lakeside-billing"]


def load(agent_id):
    return json.loads((AGENTS / f"{agent_id}.json").read_text())


def test_demo_agents_exist():
    assert sorted(p.stem for p in AGENTS.glob("*.json")) == sorted(IDS)


@pytest.mark.parametrize("agent_id", IDS)
def test_demo_agents_have_no_validation_errors(agent_id):
    assert [i for i in validate(load(agent_id)) if i.severity == "error"] == []


def test_refill_agent_is_unfinished():
    codes = {(i.code, i.node) for i in validate(load("demo-sunrise-refills"))}

    assert ("dead-end", "confirm_refill") in codes
    assert ("no-terminal", None) in codes


@pytest.mark.parametrize("agent_id", ["demo-riverside-scheduler", "demo-lakeside-billing"])
def test_other_demo_agents_have_no_warnings(agent_id):
    assert validate(load(agent_id)) == []
