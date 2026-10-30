from api import app as app_module, store
from demo import seed

NAME = "maple-family-practice"


def test_sample_guidelines_are_served(client):
    samples = {s["name"]: s for s in client.get("/api/demo/guidelines").json()}

    assert NAME in samples
    assert "Maple Family Practice" in samples[NAME]["text"]
    assert len(samples[NAME]["text"].encode()) < app_module.MAX_GUIDELINES_CHARS


def test_sample_is_a_realistic_length(client):
    text = {s["name"]: s for s in client.get("/api/demo/guidelines").json()}[NAME]["text"]
    assert 500 <= len(text.split()) <= 900


def test_sample_includes_the_reply_and_it_is_not_a_sample_itself(client):
    samples = {s["name"]: s for s in client.get("/api/demo/guidelines").json()}

    assert "24 hours" in samples[NAME]["reply"]
    assert "Aetna" in samples[NAME]["reply"] and "40 minutes" in samples[NAME]["reply"]
    assert not any(n.endswith(".reply") for n in samples)


def test_seed_stores_the_scheduler_guidelines(agents_dir):
    seed.seed()

    text = store.get_guidelines("demo-riverside-scheduler")
    assert "Cancelling" in text and "Rescheduling" in text and "Front desk" in text
    assert store.get_guidelines("demo-sunrise-refills") is None


def test_reseed_resets_edited_guidelines(agents_dir):
    seed.seed()
    original = store.get_guidelines("demo-riverside-scheduler")
    store.save_guidelines("demo-riverside-scheduler", "edited")

    seed.seed()

    assert store.get_guidelines("demo-riverside-scheduler") == original


def test_seeded_guidelines_do_not_show_as_agents(client):
    seed.seed()
    ids = [a["id"] for a in client.get("/api/agents").json()]
    assert len(ids) == len(set(ids)) and all("guidelines" not in i for i in ids)
