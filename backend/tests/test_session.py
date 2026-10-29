import json

import pytest

from api.store import starter_agent
from session import SessionError, agent_id_from_body, check_keys, load_agent


def save(agents_dir, agent_id, data):
    (agents_dir / f"{agent_id}.json").write_text(json.dumps(data))


def test_loads_a_valid_agent(agents_dir):
    save(agents_dir, "ok", starter_agent("Ok"))
    assert load_agent("ok").config.name == "Ok"


def test_unknown_id_names_the_id(agents_dir):
    with pytest.raises(SessionError, match="Unknown agent: 'nope'"):
        load_agent("nope")


@pytest.mark.parametrize("bad", ["../x", "UPPER", "a/b", ""])
def test_rejects_unsafe_ids(agents_dir, bad):
    with pytest.raises(SessionError, match="Invalid agent id"):
        load_agent(bad)


def test_refuses_blocking_issues(agents_dir):
    broken = starter_agent("Broken")
    broken["initial_node"] = "missing"
    save(agents_dir, "broken", broken)
    with pytest.raises(SessionError, match="blocking issues"):
        load_agent("broken")


def test_unparseable_file(agents_dir):
    (agents_dir / "bad.json").write_text("{")
    with pytest.raises(SessionError, match="not valid JSON"):
        load_agent("bad")


def test_agent_id_from_body():
    assert agent_id_from_body({"agent_id": "x"}) == "x"
    for body in (None, {}, {"agent_id": ""}):
        with pytest.raises(SessionError, match="without an agent_id"):
            agent_id_from_body(body)


def test_check_keys(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "a")
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    with pytest.raises(SessionError, match="ELEVENLABS_API_KEY"):
        check_keys()
    monkeypatch.setenv("ELEVENLABS_API_KEY", "b")
    check_keys()
