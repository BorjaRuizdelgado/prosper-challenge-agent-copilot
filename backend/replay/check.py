"""Replay the demo runs against the seeded agents, before only, and print a table.

    python -m replay.check [--agent ID] [--run ID ...]

Run it after `make demo` to warm up and to confirm the key and that the seeded agents still
reproduce their failures (design Decision 8). Exits 1 without OPENAI_API_KEY. Needs a real key;
pytest covers it with a fake replay function.
"""

import argparse
import asyncio
import os
import sys
from collections.abc import Awaitable, Callable
from pathlib import Path

from dotenv import load_dotenv

from api import runs, store
from demo.seed import DEMO_AGENTS_DIR

ReplayFn = Callable[[dict, dict], Awaitable[dict]]
MAX_PARALLEL = 4
HEADER = ("run", "original", "replay", "goal met", "reason")


def demo_agent_ids() -> list[str]:
    return sorted(p.stem for p in DEMO_AGENTS_DIR.glob("*.json"))


async def check(fn: ReplayFn, agent_ids: list[str], only: set[str] | None = None) -> list[tuple]:
    """Replay each demo run against its agent. Returns rows (run, original, replay, goal met, reason)."""
    sem = asyncio.Semaphore(MAX_PARALLEL)
    jobs = []
    for agent_id in agent_ids:
        agent = store.get_agent(agent_id)["agent"]
        for run in runs.list_runs(agent_id):
            if only is None or run["id"] in only:
                jobs.append((agent, run))

    async def one(agent: dict, run: dict) -> tuple:
        async with sem:
            try:
                r = await fn(agent, run)
            except Exception as e:  # one failing run must not hide the rest
                return (run["id"], run["outcome"], "error", "-", str(e))
        return (run["id"], run["outcome"], r["outcome"], "yes" if r["goal_met"] else "no", r["reason"])

    return list(await asyncio.gather(*(one(a, r) for a, r in jobs)))


def format_table(rows: list[tuple]) -> str:
    cells = [HEADER, *rows]
    widths = [max(len(str(row[i])) for row in cells) for i in range(4)]
    return "\n".join(
        " · ".join([str(row[i]).ljust(widths[i]) for i in range(4)] + [str(row[4])]) for row in cells
    )


def main(argv: list[str] | None = None, fn: ReplayFn | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--agent", action="append", help="demo agent id (default: all three)")
    parser.add_argument("--run", action="append", help="only this run id (repeatable)")
    args = parser.parse_args(argv)
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    if not os.environ.get("OPENAI_API_KEY"):
        print("Replay needs OPENAI_API_KEY in backend/.env.", file=sys.stderr)
        return 1
    if fn is None:
        from .runner import replay_run as fn
    rows = asyncio.run(check(fn, args.agent or demo_agent_ids(), set(args.run) if args.run else None))
    print(format_table(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
