from api import app as app_module


def test_create_without_guidelines_then_get_is_404(client):
    agent = client.post("/api/agents", json={"name": "Plain"}).json()
    assert client.get(f"/api/agents/{agent['id']}/guidelines").status_code == 404


def test_create_with_guidelines_and_get(client):
    res = client.post("/api/agents", json={"name": "Maple", "guidelines": "Open 9-5."})
    assert res.status_code == 201
    got = client.get(f"/api/agents/{res.json()['id']}/guidelines")
    assert got.status_code == 200 and got.json() == {"text": "Open 9-5."}


def test_create_with_oversize_guidelines_is_422(client, agents_dir):
    big = "x" * (app_module.MAX_GUIDELINES_CHARS + 1)
    assert client.post("/api/agents", json={"name": "Big", "guidelines": big}).status_code == 422
    assert client.get("/api/agents").json() == [] or all(
        a["name"] != "Big" for a in client.get("/api/agents").json()
    )


def test_put_guidelines_replaces_text(client):
    agent = client.post("/api/agents", json={"name": "A", "guidelines": "old"}).json()
    res = client.put(f"/api/agents/{agent['id']}/guidelines", json={"text": "new"})
    assert res.status_code == 200
    assert client.get(f"/api/agents/{agent['id']}/guidelines").json() == {"text": "new"}


def test_put_guidelines_adds_to_agent_without_any(client):
    agent = client.post("/api/agents", json={"name": "A"}).json()
    client.put(f"/api/agents/{agent['id']}/guidelines", json={"text": "hi"})
    assert client.get(f"/api/agents/{agent['id']}/guidelines").json() == {"text": "hi"}


def test_put_oversize_is_422(client):
    agent = client.post("/api/agents", json={"name": "A"}).json()
    big = "x" * (app_module.MAX_GUIDELINES_CHARS + 1)
    assert client.put(f"/api/agents/{agent['id']}/guidelines", json={"text": big}).status_code == 422


def test_put_unknown_agent_is_404(client):
    assert client.put("/api/agents/nope/guidelines", json={"text": "x"}).status_code == 404


def test_invalid_id_is_400(client):
    assert client.get("/api/agents/BAD_ID/guidelines").status_code == 400
    assert client.put("/api/agents/BAD_ID/guidelines", json={"text": "x"}).status_code == 400


def test_saving_guidelines_does_not_change_the_agent(client):
    agent = client.post("/api/agents", json={"name": "A"}).json()
    client.put(f"/api/agents/{agent['id']}/guidelines", json={"text": "hi"})
    assert client.get(f"/api/agents/{agent['id']}").json()["agent"] == agent["agent"]


def test_demo_guidelines_endpoint_returns_a_list(client):
    res = client.get("/api/demo/guidelines")
    assert res.status_code == 200 and isinstance(res.json(), list)
