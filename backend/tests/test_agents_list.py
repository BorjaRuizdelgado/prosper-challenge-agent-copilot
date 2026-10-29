import json

import pytest

from api import store


def test_empty_dir_is_seeded_with_example_agent(client, agents_dir):
    body = client.get("/api/agents").json()

    assert [a["id"] for a in body] == [store.SEED_ID]
    assert body[0]["name"] == "Prosper Scheduler"
    assert body[0]["node_count"] > 0
    assert (agents_dir / f"{store.SEED_ID}.json").exists()


def test_existing_agents_are_listed_and_not_reseeded(agents_dir):
    from fastapi.testclient import TestClient

    from api.app import app

    (agents_dir / "mine.json").write_text(json.dumps({"name": "Mine", "nodes": [{}, {}]}))

    with TestClient(app) as c:
        body = c.get("/api/agents").json()

    assert body == [
        {"id": "mine", "name": "Mine", "node_count": 2, "updated_at": body[0]["updated_at"]}
    ]


def test_broken_and_oddly_named_files_are_skipped(client, agents_dir):
    (agents_dir / "broken.json").write_text("{not json")
    (agents_dir / "Upper.json").write_text(json.dumps({"name": "x"}))

    ids = [a["id"] for a in client.get("/api/agents").json()]

    assert ids == [store.SEED_ID]


@pytest.mark.parametrize("bad", ["../x", "Upper", "a/b", "", "a" * 65, "sp ace", "x.json"])
def test_unsafe_ids_are_rejected(bad):
    with pytest.raises(store.InvalidAgentId):
        store.validate_agent_id(bad)


@pytest.mark.parametrize("good", ["a", "prosper-scheduler", "agent-1a2b", "a" * 64])
def test_safe_ids_are_accepted(good):
    assert store.validate_agent_id(good) == good
