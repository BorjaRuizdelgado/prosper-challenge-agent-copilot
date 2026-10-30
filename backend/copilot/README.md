# Copilot engine

Backend for the Agent Copilot (OpenSpec change `add-agent-copilot`). Claude Code, driven by the Agent SDK, edits a draft file for the open agent; the API streams what it does.

| File | Role |
| --- | --- |
| `workspace.py` | Sandbox on disk: `workspace/drafts/<agent_id>.json` and `workspace/runs/<agent_id>.txt` and `workspace/guidelines/<agent_id>.md` (git-ignored scratch), `workspace/.claude/skills/` with `prosper-blueprints` and `prosper-run-review` (committed). Stable draft read/write; `write_runs` renders the agent's production runs to the text file, or removes a stale one; `write_guidelines` does the same for the client's guidelines; the system prompt loader. Override the location with `COPILOT_WORKSPACE` (tests do). |
| `guard.py` | `check_path(tool, file_path, agent_id)`: Read/Edit/Write on the agent's draft, Read only on the agent's runs file, the agent's guidelines file and under the skills dir, everything else (including other agents' runs) denied after resolving `..` and symlinks. |
| `runs_text.py` | `render_runs(runs)`: one block per run (header with outcome, duration and flag; the node path with the edge taken and its data; the spoken lines). The format of the runs file. |
| `validate_tool.py` | The copilot's tools. `validate_agent` (`mcp__copilot__validate_agent`): the editor's validator over the draft, one line per issue. `report_findings` (`mcp__copilot__report_findings`): takes `findings: [{title, runs, cause, fix, node?}]`, rejects run ids that are not the agent's (listing them and the known ones so the model corrects itself), otherwise answers "Recorded N findings". `report_coverage` (`mcp__copilot__report_coverage`): takes `requirements: [{id, text, quote, status: covered|default|open, nodes, note?}]` and `questions: [{id, question, default, requirements}]`, checked against the draft (unique ids, known nodes, `covered`/`default` name a node, every `default` has a question); errors list what is wrong, otherwise "Recorded coverage: N of M requirements, Q questions" (N counts `covered` and `default`). |
| `workspace/.claude/skills/prosper-blueprints/` | The skill Claude loads for structural work: `SKILL.md` (agent JSON contract, validator rules, healthcare voice conventions, minimal edits, skeleton-first build) and `blueprints/*.json` example agents. |
| `workspace/.claude/skills/prosper-run-review/` | The skill Claude loads when a turn mentions the runs file: group runs by cause, call `report_findings` once before editing, fix only what the findings name, complete an unfinished agent from caller intent without inventing policy. |
| `system_prompt.md` | Persona and turn protocol. Replaces Claude Code's default prompt. |
| `events.py` | Pure helpers: step labels, node name of an edit, which drafts are worth a `draft` event. |
| `runner.py` | `run_turn(agent_id, message, agent)`: writes the draft and, when the agent has production runs (`api/runs.py`), the runs file, and adds "Its production runs are in runs/<id>.txt." to the prompt only then, and likewise writes the agent's client guidelines (`api/store.py`) to `guidelines/<id>.md` with "The client's guidelines are in guidelines/<id>.md."; yields `step`, `text`, `findings`, `coverage` (the input of a successful `report_coverage` call, after its "Reporting coverage (N/M)" step; the last one in a turn wins), `draft`, `proposal`, `done` or `error` events (`findings` carries the input of a successful `report_findings` call, after its "Reporting N findings" step; the last one in a turn wins); keeps the session id per agent (`reset_session`). |

## HTTP API

Served by `api/copilot.py` (the `run_turn` seam is injected, so tests use a fake runner).

| Endpoint | Behaviour |
| --- | --- |
| `POST /api/copilot/{agent_id}` | Body `{message, agent}` (the editor's working copy). Responds `text/event-stream` with `step`, `text`, `findings`, `coverage`, `draft`, `proposal`, `done` or `error` events (`findings`: `{findings: [{title, runs, cause, fix, node?}]}`). `409` if that agent already has a turn running, `400` for an invalid id, `422` for a bad body. A runner crash becomes an `error` event. |
| `POST /api/copilot/{agent_id}/reset` | Forgets the agent's conversation (`204`). |

When the client disconnects the stream is closed, which closes `run_turn` (it interrupts Claude Code) and frees the agent for the next turn.

Auth is whatever the `claude` CLI uses: its login, or `ANTHROPIC_API_KEY` if set (leave it unset to use the subscription). The model defaults to Haiku (cheapest); set `COPILOT_MODEL` (e.g. `sonnet`) to override.

Backend tests never call Claude (`tests/test_copilot_*.py`). To watch a real turn:

```python
import asyncio, json
from copilot import runner

agent = json.load(open("example_flow.json"))

async def main():
    async for e in runner.run_turn("demo", "Add a goodbye sentence to the end node.", agent):
        print(e)

asyncio.run(main())
```

Run it from `backend/` with `uv run python`.
