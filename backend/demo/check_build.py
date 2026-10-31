"""Check a real copilot build of a sample against its expectations.

    python -m demo.check_build [sample] [--model haiku|sonnet|opus] [--dump FILE]

Runs the build turn and then the sample client reply on a throwaway agent, and prints one row
per expectation. Needs a logged-in `claude` CLI; it is never run by pytest (the comparison in
`evaluate` is, with hand-made data, and `check` with a scripted fake client).
"""

import argparse
import asyncio
import json
import os
import re
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator, Callable

DEMO_GUIDELINES_DIR = Path(__file__).resolve().parent / "guidelines"
DEFAULT_SAMPLE = "harbor-dental-reschedule"
BUILD_MESSAGE = "Build this agent from the client's guidelines."  # same as the UI's fixed request
EXTRA_QUESTIONS_ALLOWED = 2

Runner = Callable[[str, str, dict], AsyncIterator[dict]]


@dataclass
class Result:
    id: str
    ok: bool
    detail: str = ""


def draft_text(draft: dict) -> str:
    """All the text of an agent draft, one string value per line."""
    lines: list[str] = []

    def walk(value: Any) -> None:
        if isinstance(value, str):
            lines.append(value)
        elif isinstance(value, dict):
            for v in value.values():
                walk(v)
        elif isinstance(value, list):
            for v in value:
                walk(v)

    walk(draft)
    return "\n".join(lines)


DIGIT_WORDS = {"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9"}


def _digits_only(text: str) -> str:
    """The text with spelled-out digits as digits and every other separator dropped.

    A voice agent should say a number digit by digit ("five five five, zero one four two"), so
    `555-0142` and its spelled-out form must count as the same value.
    """
    words = re.sub(r"\b(" + "|".join(DIGIT_WORDS) + r")\b", lambda m: DIGIT_WORDS[m.group(1).lower()], text, flags=re.IGNORECASE)
    return re.sub(r"[^0-9a-z]", "", words.lower())


def contains_value(text: str, needle: str) -> bool:
    return needle in text or _digits_only(needle) in _digits_only(text)


def _node_texts(draft: dict) -> list[str]:
    return [draft_text(node) for node in draft.get("nodes", [])]


def _asks_about(question: dict, words: list[str]) -> bool:
    text = f"{question.get('question', '')}".lower()
    return any(w.lower() in text for w in words)


def evaluate(expected: dict, coverage: dict | None, draft: dict, phase: str) -> list[Result]:
    """Compare a coverage report and a draft with the sample's expectations.

    `phase` is "build" (the first turn) or "reply" (after the client's answers). Pure: plain
    dicts in, results out. A missing coverage report fails the gap expectations.
    """
    results: list[Result] = []
    questions = (coverage or {}).get("questions", [])
    gaps = expected.get("gaps", [])

    if phase == "build":
        nodes = [t.lower() for t in _node_texts(draft)]
        for topic in expected.get("topics", []):
            hit = next((w for w in topic["any"] if any(w.lower() in n for n in nodes)), None)
            results.append(Result(f"topic:{topic['id']}", hit is not None, f"matched '{hit}'" if hit else f"no node mentions any of {topic['any']}"))
        for gap in gaps:
            asked = [q for q in questions if _asks_about(q, gap["question_any"])]
            if coverage is None:
                results.append(Result(f"gap:{gap['id']}", False, "no coverage report"))
            elif asked:
                results.append(Result(f"gap:{gap['id']}", True, f"asked: {asked[0].get('question', '')[:90]}"))
            else:
                results.append(Result(f"gap:{gap['id']}", False, f"no question mentions any of {gap['question_any']}"))
        limit = len(gaps) + EXTRA_QUESTIONS_ALLOWED
        results.append(Result("questions-not-a-flood", coverage is not None and len(questions) <= limit, f"{len(questions)} questions, at most {limit}"))
        text = draft_text(draft)
        for rule in expected.get("forbidden_before_reply", []):
            found = re.search(rule["pattern"], text, re.IGNORECASE)
            results.append(Result(f"no:{rule['id']}", found is None, f"found '{found.group(0)}'" if found else "nothing invented"))
    else:
        text = draft_text(draft)
        for needle in expected.get("required_after_reply", []):
            found = contains_value(text, needle)
            results.append(Result(f"has:{needle}", found, "present" if found else "missing from the draft"))
        for gap in gaps:
            left = [q for q in questions if _asks_about(q, gap["question_any"])]
            if coverage is None:
                results.append(Result(f"closed:{gap['id']}", False, "no coverage report"))
            else:
                results.append(Result(f"closed:{gap['id']}", not left, f"still asked: {left[0].get('question', '')[:90]}" if left else "no question left"))
    return results


def load_expected(sample: str) -> dict:
    return json.loads((DEMO_GUIDELINES_DIR / f"{sample}.expected.json").read_text())


async def _turn(run: Runner, agent_id: str, message: str, agent: dict) -> dict:
    """Run one turn; returns the last coverage, the last proposal and the error, if any."""
    out: dict = {"coverage": None, "proposal": None, "error": None, "steps": 0}
    started = time.monotonic()
    async for event in run(agent_id, message, agent):
        name, data = event["event"], event["data"]
        if name == "coverage":
            out["coverage"] = data
        elif name == "proposal":
            out["proposal"] = data
        elif name == "error":
            out["error"] = data.get("message", "error")
        elif name == "step":
            out["steps"] += 1
    out["seconds"] = time.monotonic() - started
    return out


def _issues(turn: dict) -> list[dict]:
    return [i for i in (turn["proposal"] or {}).get("issues", []) if i.get("severity") == "error"]


async def check(sample: str, run: Runner, store_module=None, dump: dict | None = None) -> tuple[list[tuple[str, Result]], dict]:
    """Build the sample, then send its reply. Returns [(phase, Result)] and a summary dict."""
    from api import store

    store_module = store_module or store
    expected = load_expected(sample)
    text = (DEMO_GUIDELINES_DIR / f"{sample}.md").read_text()
    reply = (DEMO_GUIDELINES_DIR / f"{sample}.reply.md").read_text()
    created = store_module.create_agent(f"check {sample}", guidelines=text)
    agent_id, agent = created["id"], created["agent"]
    rows: list[tuple[str, Result]] = []
    summary: dict = {"sample": sample}

    for phase, message in (("build", BUILD_MESSAGE), ("reply", reply)):
        turn = await _turn(run, agent_id, message, agent)
        summary[phase] = {"seconds": round(turn["seconds"], 1), "steps": turn["steps"]}
        if turn["error"]:
            rows.append((phase, Result("turn", False, turn["error"])))
            break
        draft = (turn["proposal"] or {}).get("agent", agent)
        coverage = turn["coverage"]
        summary[phase]["changed_agent"] = turn["proposal"] is not None
        if dump is not None:
            dump[phase] = {"coverage": coverage, "draft": draft, "changed_agent": turn["proposal"] is not None}
        summary[phase]["requirements"] = len((coverage or {}).get("requirements", []))
        summary[phase]["questions"] = len((coverage or {}).get("questions", []))
        errors = _issues(turn)
        rows.append((phase, Result("no-validation-errors", not errors, f"{len(errors)} errors" + (f": {errors[0].get('message')}" if errors else ""))))
        rows += [(phase, r) for r in evaluate(expected, coverage, draft, phase)]
        agent = draft  # the reply turn works on the applied proposal
    return rows, summary


def format_rows(rows: list[tuple[str, Result]], summary: dict) -> str:
    lines = [f"Sample: {summary['sample']}"]
    for phase, r in rows:
        lines.append(f"  [{'PASS' if r.ok else 'FAIL'}] {phase:<5} {r.id:<28} {r.detail}")
    for phase in ("build", "reply"):
        if phase in summary:
            s = summary[phase]
            changed = "" if s.get("changed_agent", True) else ", the copilot did not change the agent"
            lines.append(f"  {phase}: {s['seconds']} s, {s.get('requirements', '-')} requirements, {s.get('questions', '-')} questions, {s['steps']} steps{changed}")
    failed = sum(1 for _, r in rows if not r.ok)
    lines.append(f"{len(rows) - failed} of {len(rows)} expectations hold" + ("" if not failed else f", {failed} failed"))
    return "\n".join(lines)


def main(argv: list[str] | None = None, run: Runner | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m demo.check_build", description=__doc__.split("\n\n")[0])
    parser.add_argument("sample", nargs="?", default=DEFAULT_SAMPLE, help=f"sample name (default {DEFAULT_SAMPLE})")
    parser.add_argument("--dump", metavar="FILE", help="also write the coverage reports and drafts of both turns to FILE as JSON")
    parser.add_argument("--model", help="copilot model alias, sets COPILOT_MODEL (default sonnet)")
    args = parser.parse_args(argv)
    if args.model:
        os.environ["COPILOT_MODEL"] = args.model

    if run is None:
        from copilot import runner

        run = runner.run_turn
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["AGENTS_DIR"] = tmp
        dump: dict = {}
        rows, summary = asyncio.run(check(args.sample, run, dump=dump))
        _cleanup_workspace(tmp)
    if args.dump:
        Path(args.dump).write_text(json.dumps(dump, indent=2, ensure_ascii=False))
    print(format_rows(rows, summary))
    return 0 if rows and all(r.ok for _, r in rows) else 1


def _cleanup_workspace(agents_dir: str) -> None:
    from copilot import workspace

    for path in Path(agents_dir).glob("*.json"):
        for p in (workspace.draft_path(path.stem), workspace.guidelines_path(path.stem), workspace.runs_path(path.stem)):
            p.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
