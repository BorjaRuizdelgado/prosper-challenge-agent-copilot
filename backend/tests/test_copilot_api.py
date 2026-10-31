import asyncio
import json

import pytest

from api import copilot as copilot_api
from api.app import app
from copilot import runner

AGENT = {"name": "Clinic", "initial_node": "a", "nodes": [{"name": "a", "task_messages": ["Hi."], "end": True}]}
BODY = {"message": "add a goodbye", "agent": AGENT}


def events(*pairs):
    return [{"event": name, "data": data} for name, data in pairs]


def parse_sse(text):
    out = []
    for block in text.strip().split("\n\n"):
        name, data = block.split("\n")
        out.append((name.removeprefix("event: "), json.loads(data.removeprefix("data: "))))
    return out


def use_runner(fake):
    app.dependency_overrides[copilot_api.get_runner] = lambda: fake


@pytest.fixture(autouse=True)
def clean():
    copilot_api._busy.clear()
    runner._sessions.clear()
    yield
    app.dependency_overrides.clear()
    copilot_api._busy.clear()
    runner._sessions.clear()


def scripted(script, calls=None):
    async def fake(agent_id, message, agent):
        if calls is not None:
            calls.append((agent_id, message, agent))
        for event in script:
            yield event

    return fake


def test_streams_the_event_sequence(client):
    calls = []
    script = events(
        ("step", {"label": "Reading agent"}),
        ("step", {"label": "Editing a", "node": "a"}),
        ("draft", {"agent": AGENT}),
        ("text", {"delta": "Done."}),
        ("proposal", {"agent": AGENT, "issues": []}),
        ("done", {}),
    )
    use_runner(scripted(script, calls))
    res = client.post("/api/copilot/clinic", json=BODY)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert res.headers["cache-control"] == "no-cache"
    assert parse_sse(res.text) == [(e["event"], e["data"]) for e in script]
    assert calls == [("clinic", "add a goodbye", AGENT)]


def test_setup_error_reaches_the_client_with_its_flag(client):
    use_runner(scripted(events(("error", {"message": "Log in to Claude.", "setup": True}))))
    res = client.post("/api/copilot/clinic", json=BODY)
    assert res.status_code == 200
    assert parse_sse(res.text) == [("error", {"message": "Log in to Claude.", "setup": True})]


def test_runner_crash_becomes_an_error_event_and_frees_the_agent(client):
    async def broken(agent_id, message, agent):
        yield {"event": "step", "data": {"label": "Reading agent"}}
        raise RuntimeError("boom")

    use_runner(broken)
    res = client.post("/api/copilot/clinic", json=BODY)
    assert [name for name, _ in parse_sse(res.text)] == ["step", "error"]
    assert "boom" in parse_sse(res.text)[-1][1]["message"]
    assert "clinic" not in copilot_api._busy


def test_agent_is_free_after_a_turn(client):
    use_runner(scripted(events(("done", {}))))
    assert client.post("/api/copilot/clinic", json=BODY).status_code == 200
    assert client.post("/api/copilot/clinic", json=BODY).status_code == 200


def test_concurrent_turn_on_the_same_agent_is_409(client):
    copilot_api._busy["clinic"] = object()
    use_runner(scripted(events(("done", {}))))
    res = client.post("/api/copilot/clinic", json=BODY)
    assert res.status_code == 409
    # Another agent is unaffected.
    assert client.post("/api/copilot/other", json=BODY).status_code == 200


def test_invalid_id_is_rejected_before_any_work(client):
    calls = []
    use_runner(scripted([], calls))
    res = client.post("/api/copilot/bad%20id", json=BODY)
    assert res.status_code == 400
    assert calls == []


@pytest.mark.parametrize("body", [{}, {"message": "", "agent": AGENT}, {"message": "x"}, {"message": "x", "agent": []}])
def test_bad_body_is_422(client, body):
    use_runner(scripted([]))
    assert client.post("/api/copilot/clinic", json=body).status_code == 422


def test_reset_forgets_the_session(client):
    runner._sessions["clinic"] = "s1"
    runner._sessions["other"] = "s2"
    assert client.post("/api/copilot/clinic/reset").status_code == 204
    assert runner._sessions == {"other": "s2"}


def test_reset_rejects_invalid_id(client):
    assert client.post("/api/copilot/bad%20id/reset").status_code == 400


@pytest.mark.anyio
async def test_client_disconnect_closes_the_runner_and_releases_the_agent():
    state = {"closed": False}

    async def fake(agent_id, message, agent):
        try:
            yield {"event": "step", "data": {"label": "Reading agent"}}
            await asyncio.sleep(60)  # a long turn
            yield {"event": "done", "data": {}}
        finally:
            state["closed"] = True  # what run_turn uses to interrupt Claude Code

    token = object()
    copilot_api._busy["clinic"] = token
    stream = copilot_api.stream_turn(fake("clinic", "m", AGENT), "clinic", token)
    assert "Reading agent" in await stream.__anext__()
    await stream.aclose()  # what Starlette does when the client disconnects
    assert state["closed"]
    assert "clinic" not in copilot_api._busy


def test_stale_release_does_not_free_a_newer_turn():
    newer = object()
    copilot_api._busy["clinic"] = newer
    copilot_api._release("clinic", object())
    assert copilot_api._busy["clinic"] is newer


@pytest.fixture
def anyio_backend():
    return "asyncio"
