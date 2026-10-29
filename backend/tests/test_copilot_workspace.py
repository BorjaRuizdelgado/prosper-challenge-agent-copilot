import json

import pytest

from api.store import InvalidAgentId
from copilot import workspace

AGENT = {"name": "Clínica", "initial_node": "a", "nodes": [{"name": "a", "end": True}]}


@pytest.fixture(autouse=True)
def copilot_workspace(tmp_path, monkeypatch):
    monkeypatch.setenv("COPILOT_WORKSPACE", str(tmp_path))
    return tmp_path


def test_round_trip(copilot_workspace):
    path = workspace.write_draft("clinic", AGENT)
    assert path == copilot_workspace / "drafts" / "clinic.json"
    assert workspace.read_draft("clinic") == AGENT


def test_draft_is_byte_identical_for_equal_input():
    first = workspace.write_draft("clinic", AGENT).read_bytes()
    reordered = {k: AGENT[k] for k in reversed(list(AGENT))}  # same keys, other order
    second = workspace.write_draft("clinic", dict(AGENT)).read_bytes()
    assert first == second
    assert first.endswith(b"\n") and b"\n  " in first  # pretty-printed
    assert "Clínica".encode() in first  # not ascii-escaped
    # Key order of the input is preserved, not sorted: the file mirrors the editor's document.
    assert list(json.loads(workspace.write_draft("clinic", reordered).read_text())) == list(reordered)


@pytest.mark.parametrize("bad", ["../x", "a/b", "A", "", "x" * 65, "a.json"])
def test_rejects_bad_ids(bad):
    with pytest.raises(InvalidAgentId):
        workspace.write_draft(bad, AGENT)
    with pytest.raises(InvalidAgentId):
        workspace.read_draft(bad)


def test_overwrites_previous_draft():
    workspace.write_draft("clinic", AGENT)
    workspace.write_draft("clinic", {**AGENT, "name": "Other"})
    assert workspace.read_draft("clinic")["name"] == "Other"


def test_read_missing_draft_raises():
    with pytest.raises(FileNotFoundError):
        workspace.read_draft("nope")
