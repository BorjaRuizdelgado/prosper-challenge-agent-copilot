import asyncio

import pytest

from api import runs
from demo.seed import seed
from replay import check


@pytest.fixture
def seeded(monkeypatch, tmp_path):
    monkeypatch.setenv("AGENTS_DIR", str(tmp_path))
    seed()


def test_check_returns_one_row_per_run(seeded):
    async def fake(agent, run):
        return {"outcome": "stuck", "goal_met": False, "reason": run["id"]}

    rows = asyncio.run(check.check(fake, ["demo-lakeside-billing"]))
    expected = runs.list_runs("demo-lakeside-billing")
    assert [r[0] for r in rows] == [r["id"] for r in expected]
    assert rows[0] == (expected[0]["id"], expected[0]["outcome"], "stuck", "no", expected[0]["id"])


def test_only_filters_runs_and_errors_stay_in_the_row(seeded):
    async def fake(agent, run):
        raise RuntimeError("boom")

    rows = asyncio.run(check.check(fake, ["demo-riverside-scheduler"], {"r-1004"}))
    assert rows == [("r-1004", "abandoned", "error", "-", "boom")]


def test_table_prints_header_and_rows():
    text = check.format_table([("r-1", "abandoned", "completed", "yes", "ok")])
    lines = text.splitlines()
    assert lines[0].startswith("run") and "reason" in lines[0]
    assert lines[1].endswith("ok") and "r-1" in lines[1]


def test_missing_key_exits_1(monkeypatch, capsys):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(check, "load_dotenv", lambda *_: None)
    assert check.main([]) == 1
    assert "OPENAI_API_KEY" in capsys.readouterr().err


def test_main_prints_table_with_fake(seeded, monkeypatch, capsys):
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setattr(check, "load_dotenv", lambda *_: None)

    async def fake(agent, run):
        return {"outcome": "completed", "goal_met": True, "reason": "fine"}

    assert check.main(["--agent", "demo-lakeside-billing", "--run", "r-3001"], fn=fake) == 0
    out = capsys.readouterr().out
    assert "r-3001" in out and "fine" in out and "r-3002" not in out


def test_fake_receives_the_agent_dict_not_the_record(seeded):
    seen = []

    async def fake(agent, run):
        seen.append(agent)
        return {"outcome": "completed", "goal_met": True, "reason": ""}

    asyncio.run(check.check(fake, ["demo-lakeside-billing"], {"r-3001"}))
    assert seen[0]["name"] and "nodes" in seen[0]
