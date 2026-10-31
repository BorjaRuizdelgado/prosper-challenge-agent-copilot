import json

from api import store
from demo import seed


def test_first_seed_writes_every_demo_agent(agents_dir):
    ids = seed.seed()

    assert sorted(ids) == sorted(p.stem for p in seed.DEMO_AGENTS_DIR.glob("*.json"))
    for agent_id in ids:
        assert store.get_agent(agent_id)["agent"] == json.loads((seed.DEMO_AGENTS_DIR / f"{agent_id}.json").read_text())


def test_reseed_restores_a_changed_agent(agents_dir):
    seed.seed()
    path = store.agent_path("demo-sunrise-refills")
    original = json.loads(path.read_text())
    path.write_text(json.dumps({**original, "name": "Edited"}))

    seed.seed()

    assert json.loads(path.read_text()) == original


def test_seed_leaves_other_agents_untouched(agents_dir):
    mine = agents_dir / "mine.json"
    mine.write_text(json.dumps({"name": "Mine"}))

    seed.seed()

    assert json.loads(mine.read_text()) == {"name": "Mine"}


def test_seeded_agents_show_in_the_agent_list(client):
    seed.seed()

    ids = {a["id"] for a in client.get("/api/agents").json()}

    assert {"demo-riverside-scheduler", "demo-sunrise-refills", "demo-lakeside-billing"} <= ids
