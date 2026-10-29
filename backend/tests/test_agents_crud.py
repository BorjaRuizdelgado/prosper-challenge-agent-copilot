import json
import os

import pytest

from api import store


def test_create_from_name_stores_a_starter_agent(client, agents_dir):
    res = client.post("/api/agents", json={"name": "  Dental Intake  "})

    assert res.status_code == 201
    body = res.json()
    assert body["id"].startswith("dental-intake-")
    assert body["agent"]["name"] == "Dental Intake"
    assert body["agent"]["initial_node"] == "greeting"
    assert [n["name"] for n in body["agent"]["nodes"]] == ["greeting"]
    assert (agents_dir / f"{body['id']}.json").exists()
    assert body["id"] in [a["id"] for a in client.get("/api/agents").json()]


def test_create_rejects_blank_name(client):
    assert client.post("/api/agents", json={"name": ""}).status_code == 422


def test_create_with_unsluggable_name_still_gets_a_valid_id(client):
    agent_id = client.post("/api/agents", json={"name": "日本語"}).json()["id"]

    assert store.validate_agent_id(agent_id) == agent_id


def test_get_returns_the_document(client):
    body = client.get(f"/api/agents/{store.SEED_ID}").json()

    assert body["id"] == store.SEED_ID
    assert body["agent"]["name"] == "Prosper Scheduler"
    assert body["updated_at"]


def test_put_replaces_the_document_even_with_validation_issues(client, agents_dir):
    doc = {"name": "Renamed", "initial_node": "nope", "nodes": []}

    res = client.put(f"/api/agents/{store.SEED_ID}", json=doc)

    assert res.status_code == 200
    assert res.json()["agent"] == doc
    assert json.loads((agents_dir / f"{store.SEED_ID}.json").read_text()) == doc


def test_failed_write_keeps_the_previous_file(client, agents_dir, monkeypatch):
    path = agents_dir / f"{store.SEED_ID}.json"
    before = path.read_text()

    def boom(*_):
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", boom)
    with pytest.raises(OSError):
        client.put(f"/api/agents/{store.SEED_ID}", json={"name": "New"})

    assert path.read_text() == before
    assert [p.name for p in agents_dir.iterdir()] == [path.name]


def test_duplicate_copies_with_a_new_id_and_name(client, agents_dir):
    res = client.post(f"/api/agents/{store.SEED_ID}/duplicate")

    assert res.status_code == 201
    body = res.json()
    assert body["id"] != store.SEED_ID
    assert body["agent"]["name"] == "Prosper Scheduler copy"
    assert len(body["agent"]["nodes"]) == len(
        client.get(f"/api/agents/{store.SEED_ID}").json()["agent"]["nodes"]
    )
    assert len(list(agents_dir.glob("*.json"))) == 2


def test_delete_removes_the_file(client, agents_dir):
    res = client.delete(f"/api/agents/{store.SEED_ID}")

    assert res.status_code == 204
    assert not (agents_dir / f"{store.SEED_ID}.json").exists()
    assert client.get(f"/api/agents/{store.SEED_ID}").status_code == 404


@pytest.mark.parametrize(
    "call",
    [
        lambda c: c.get("/api/agents/ghost"),
        lambda c: c.put("/api/agents/ghost", json={"name": "x"}),
        lambda c: c.post("/api/agents/ghost/duplicate"),
        lambda c: c.delete("/api/agents/ghost"),
    ],
)
def test_unknown_id_is_404_and_creates_nothing(client, agents_dir, call):
    assert call(client).status_code == 404
    assert [p.name for p in agents_dir.iterdir()] == [f"{store.SEED_ID}.json"]


@pytest.mark.parametrize("bad", ["UPPER", "has_underscore", "x.json"])
def test_unsafe_ids_get_400_on_every_route(client, agents_dir, bad):
    for res in (
        client.get(f"/api/agents/{bad}"),
        client.put(f"/api/agents/{bad}", json={"name": "x"}),
        client.post(f"/api/agents/{bad}/duplicate"),
        client.delete(f"/api/agents/{bad}"),
    ):
        assert res.status_code == 400
    assert [p.name for p in agents_dir.iterdir()] == [f"{store.SEED_ID}.json"]
