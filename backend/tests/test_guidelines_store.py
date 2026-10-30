from api import store


def test_create_without_guidelines_has_none(agents_dir):
    agent = store.create_agent("Plain")
    assert store.get_guidelines(agent["id"]) is None


def test_create_with_guidelines_stores_them(agents_dir):
    agent = store.create_agent("Maple", guidelines="Open 9 to 5.")
    assert store.get_guidelines(agent["id"]) == "Open 9 to 5."


def test_save_guidelines_replaces_text_and_leaves_no_temp_files(agents_dir):
    agent = store.create_agent("Maple", guidelines="old")
    store.save_guidelines(agent["id"], "new")
    assert store.get_guidelines(agent["id"]) == "new"
    assert not list(agents_dir.glob(".tmp-*"))


def test_duplicate_copies_guidelines(agents_dir):
    agent = store.create_agent("Maple", guidelines="rules")
    copy = store.duplicate_agent(agent["id"])
    assert store.get_guidelines(copy["id"]) == "rules"


def test_duplicate_without_guidelines_has_none(agents_dir):
    agent = store.create_agent("Plain")
    assert store.get_guidelines(store.duplicate_agent(agent["id"])["id"]) is None


def test_delete_removes_guidelines(agents_dir):
    agent = store.create_agent("Maple", guidelines="rules")
    store.delete_agent(agent["id"])
    assert store.get_guidelines(agent["id"]) is None
    assert not list(agents_dir.glob("*.guidelines.md"))


def test_agent_list_shows_only_agents(agents_dir):
    agent = store.create_agent("Maple", guidelines="rules")
    assert [a["id"] for a in store.list_agents()] == [agent["id"]]
