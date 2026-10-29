import pytest
from fastapi.testclient import TestClient

from api.app import app


@pytest.fixture
def agents_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENTS_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def client(agents_dir):
    with TestClient(app) as c:  # entering the context runs the lifespan (seed)
        yield c
