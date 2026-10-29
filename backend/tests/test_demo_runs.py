import json
from datetime import datetime
from pathlib import Path

import pytest

DEMO = Path(__file__).resolve().parent.parent / "demo"
IDS = ["demo-riverside-scheduler", "demo-sunrise-refills", "demo-lakeside-billing"]
OUTCOMES = {"completed", "transferred", "abandoned", "stuck"}


def runs(agent_id):
    return json.loads((DEMO / "runs" / f"{agent_id}.json").read_text())


def agent(agent_id):
    return json.loads((DEMO / "agents" / f"{agent_id}.json").read_text())


@pytest.mark.parametrize("agent_id", IDS)
def test_each_demo_agent_has_about_eight_runs_with_unique_ids(agent_id):
    ids = [r["id"] for r in runs(agent_id)]

    assert 7 <= len(ids) <= 10
    assert len(set(ids)) == len(ids)


def test_run_ids_are_unique_across_agents():
    ids = [r["id"] for a in IDS for r in runs(a)]

    assert len(set(ids)) == len(ids)


@pytest.mark.parametrize("agent_id", IDS)
def test_run_fields_are_well_formed(agent_id):
    for r in runs(agent_id):
        assert r["outcome"] in OUTCOMES
        assert isinstance(r["duration_s"], int) and r["duration_s"] > 0
        datetime.fromisoformat(r["started_at"].replace("Z", "+00:00"))
        assert r.get("flag", "x").strip()
        assert r["transcript"] and r["path"]


@pytest.mark.parametrize("agent_id", IDS)
def test_transcripts_alternate_speakers_starting_with_the_agent(agent_id):
    for r in runs(agent_id):
        speakers = [line["speaker"] for line in r["transcript"]]
        assert speakers == [("agent", "caller")[i % 2] for i in range(len(speakers))], r["id"]
        assert all(line["text"].strip() for line in r["transcript"])


@pytest.mark.parametrize("agent_id", IDS)
def test_paths_follow_the_agent_graph(agent_id):
    nodes = {n["name"]: n for n in agent(agent_id)["nodes"]}
    for r in runs(agent_id):
        path = r["path"]
        assert path[0]["node"] == agent(agent_id)["initial_node"] and "via" not in path[0]
        for prev, step in zip(path, path[1:]):
            edges = {e["function"]: e["target"] for e in nodes[prev["node"]]["edges"]}
            assert edges.get(step["via"]) == step["node"], (r["id"], step)


def test_demo_runs_plant_the_expected_outcomes():
    refills = runs("demo-sunrise-refills")
    assert all(r["path"][-1]["node"] == "confirm_refill" for r in refills)
    assert {r["outcome"] for r in refills} <= {"stuck", "abandoned"}

    scheduler = runs("demo-riverside-scheduler")
    assert sum(r["outcome"] == "completed" for r in scheduler) >= 3
    assert sum("flag" in r for r in scheduler) >= 2

    billing = runs("demo-lakeside-billing")
    assert sum(r["outcome"] in {"completed", "transferred"} for r in billing) >= len(billing) - 1
    assert sum("flag" in r for r in billing) == 1
