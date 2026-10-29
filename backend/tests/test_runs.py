import json

import pytest


@pytest.fixture
def runs_dir(tmp_path, monkeypatch):
    path = tmp_path / "runs"
    path.mkdir()
    monkeypatch.setenv("RUNS_DIR", str(path))
    return path


def test_demo_agent_runs_are_newest_first_with_the_full_shape(client):
    runs = client.get("/api/agents/demo-riverside-scheduler/runs").json()

    started = [r["started_at"] for r in runs]
    assert started == sorted(started, reverse=True)
    assert len(runs) >= 7
    for r in runs:
        assert {"id", "started_at", "duration_s", "outcome", "transcript", "path"} <= r.keys()
    assert any("flag" in r for r in runs)


def test_agent_without_runs_has_an_empty_list(client):
    res = client.get("/api/agents/no-runs-here/runs")

    assert res.status_code == 200
    assert res.json() == []


def test_invalid_agent_id_is_rejected(client):
    assert client.get("/api/agents/Bad_Id/runs").status_code == 400
    assert client.get("/api/agents/..%2Fsecret/runs").status_code in (400, 404)


def test_runs_come_from_the_runs_directory(client, runs_dir):
    older = {"id": "a", "started_at": "2026-01-01T00:00:00Z"}
    newer = {"id": "b", "started_at": "2026-02-01T00:00:00Z"}
    (runs_dir / "mine.json").write_text(json.dumps([older, newer]))

    assert [r["id"] for r in client.get("/api/agents/mine/runs").json()] == ["b", "a"]


def test_test_call_code_never_touches_runs():
    """Runs are read-only demo data: the call path (session.py, bot.py) has no access to them."""
    from pathlib import Path

    backend = Path(__file__).resolve().parent.parent
    for name in ("session.py", "bot.py"):
        assert "runs" not in (backend / name).read_text().lower(), name
