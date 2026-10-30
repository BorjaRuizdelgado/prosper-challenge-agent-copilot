import json

import pytest
from fastapi.testclient import TestClient

from api import replay as replay_api
from api.app import app, load_env
from replay.client import OpenAIChatClient

AGENT = {"name": "A", "initial_node": "a", "nodes": [{"name": "a", "task_messages": ["Hi."], "end": True}]}
BODY = {"base": AGENT, "proposal": AGENT, "run_ids": ["r-1", "r-2"]}
RUNS = [{"id": "r-1", "started_at": "2026-01-01"}, {"id": "r-2", "started_at": "2026-01-02"}]


def parse_sse(text):
    out = []
    for block in text.strip().split("\n\n"):
        name, data = block.split("\n")
        out.append((name.removeprefix("event: "), json.loads(data.removeprefix("data: "))))
    return out


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(replay_api.runs, "list_runs", lambda agent_id: RUNS)
    yield TestClient(app)
    app.dependency_overrides.clear()


def use(fn):
    app.dependency_overrides[replay_api.get_replay_fn] = lambda: fn


def post(api, body=BODY):
    return api.post("/api/agents/a1/replay", json=body)


def test_event_order_and_results(api):
    async def fake(agent, run, on_line=None):
        return {"transcript": [], "path": [{"node": "a"}], "outcome": "completed", "goal_met": True, "reason": run["id"]}

    use(fake)
    events = parse_sse(post(api).text)
    assert events[-1] == ("done", {})
    names = [n for n, _ in events]
    assert names.count("started") == 4 and names.count("result") == 4
    for key in {(d["run_id"], d["version"]) for n, d in events if n == "started"}:
        started = next(i for i, (n, d) in enumerate(events) if n == "started" and (d["run_id"], d["version"]) == key)
        result = next(i for i, (n, d) in enumerate(events) if n == "result" and (d["run_id"], d["version"]) == key)
        assert started < result
    result = next(d for n, d in events if n == "result")
    assert result["outcome"] == "completed" and result["goal_met"] is True and result["path"]


def test_lines_stream_before_their_result(api):
    async def fake(agent, run, on_line=None):
        on_line({"speaker": "agent", "text": "Hello"})
        on_line({"speaker": "caller", "text": "Hi"})
        return {"transcript": [], "path": [], "outcome": "completed", "goal_met": True, "reason": ""}

    use(fake)
    events = parse_sse(post(api, {**BODY, "proposal": None, "run_ids": ["r-1"]}).text)
    assert [n for n, _ in events] == ["started", "line", "line", "result", "done"]
    assert events[1][1] == {"run_id": "r-1", "version": "before", "speaker": "agent", "text": "Hello"}


def test_versions_use_base_and_proposal(api):
    seen = []

    async def fake(agent, run, on_line=None):
        seen.append(agent["name"])
        return {"transcript": [], "path": [], "outcome": "completed", "goal_met": True, "reason": ""}

    use(fake)
    post(api, {**BODY, "base": {**AGENT, "name": "base"}, "proposal": {**AGENT, "name": "prop"}, "run_ids": ["r-1"]})
    assert sorted(seen) == ["base", "prop"]


def test_no_key_is_one_setup_error(api, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY")
    called = []

    async def fake(agent, run, on_line=None):
        called.append(1)

    use(fake)
    events = parse_sse(post(api).text)
    assert [n for n, _ in events] == ["error", "done"]
    assert events[0][1]["setup"] is True and "OPENAI_API_KEY" in events[0][1]["message"]
    assert not called


def test_one_failing_job_errors_only_that_job(api):
    async def fake(agent, run, on_line=None):
        if run["id"] == "r-2" and agent["name"] == "boom":
            raise RuntimeError("nope")
        return {"transcript": [], "path": [], "outcome": "completed", "goal_met": True, "reason": ""}

    use(fake)
    events = parse_sse(post(api, {**BODY, "proposal": {**AGENT, "name": "boom"}}).text)
    errors = [d for n, d in events if n == "error"]
    assert len(errors) == 1
    assert errors[0]["run_id"] == "r-2" and errors[0]["version"] == "after" and errors[0]["setup"] is False
    assert [n for n, _ in events].count("result") == 3
    assert events[-1][0] == "done"


def test_unknown_run_id_is_400(api):
    async def fake(agent, run, on_line=None):
        raise AssertionError("must not run")

    use(fake)
    r = post(api, {**BODY, "run_ids": ["r-1", "nope"]})
    assert r.status_code == 400 and "nope" in r.json()["detail"]


def test_env_file_key_is_visible_to_replay(monkeypatch, tmp_path):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=from-file\n")
    load_env(env)
    import os

    assert os.environ["OPENAI_API_KEY"] == "from-file"
    assert OpenAIChatClient()._client.api_key == "from-file"


def test_without_proposal_only_before_runs(api):
    seen = []

    async def fake(agent, run, on_line=None):
        seen.append(agent["name"])
        return {"transcript": [], "path": [], "outcome": "completed", "goal_met": True, "reason": ""}

    use(fake)
    body = {"base": {**AGENT, "name": "base"}, "run_ids": ["r-1", "r-2"]}
    events = parse_sse(post(api, body).text)
    assert seen == ["base", "base"]
    assert {d["version"] for n, d in events if n == "result"} == {"before"}
    assert events[-1] == ("done", {})
