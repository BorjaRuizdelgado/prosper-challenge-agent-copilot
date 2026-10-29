#
# Production runs as the plain text the copilot reads (design Decision 4): one block per run,
# a header line, the node path, then the spoken lines. A pure function, so the format is tested.
#

import json


def _duration(seconds: int) -> str:
    return f"{seconds // 60}m{seconds % 60:02d}s" if seconds >= 60 else f"{seconds}s"


def _step(step: dict) -> str:
    """`node`, or `node (via: {args})` when the step came through an edge; empty args are left out."""
    via = step.get("via")
    if not via:
        return step["node"]
    args = step.get("args")
    detail = f"{via}: {json.dumps(args, ensure_ascii=False)}" if args else via
    return f"{step['node']} ({detail})"


def render_run(run: dict) -> str:
    header = f"run {run['id']} · {run['outcome']} · {_duration(run['duration_s'])}"
    if run.get("flag"):
        header += f" · flag: {run['flag']}"
    lines = [header, "path: " + " -> ".join(_step(s) for s in run["path"])]
    lines += [f"{'Agent' if line['speaker'] == 'agent' else 'Caller'}: {line['text']}" for line in run["transcript"]]
    return "\n".join(lines)


def render_runs(runs: list[dict]) -> str:
    """Runs in the order given, separated by a blank line."""
    return "\n\n".join(render_run(r) for r in runs) + "\n"
