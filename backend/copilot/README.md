# Copilot engine

Backend for the Agent Copilot (OpenSpec change `add-agent-copilot`). Claude Code, driven by the Agent SDK, edits a draft file for the open agent; the API streams what it does.

| File | Role |
| --- | --- |
| `workspace.py` | Sandbox on disk: `workspace/drafts/<agent_id>.json` (git-ignored scratch), `workspace/.claude/skills/prosper-blueprints/` (committed). Stable draft read/write; the system prompt loader. Override the location with `COPILOT_WORKSPACE` (tests do). |
| `guard.py` | `check_path(tool, file_path, agent_id)`: Read/Edit/Write on the agent's draft, Read only under the skill dir, everything else denied after resolving `..` and symlinks. |
| `validate_tool.py` | The `validate_agent` tool (`mcp__copilot__validate_agent`): the editor's validator over the draft, one line per issue. |
| `workspace/.claude/skills/prosper-blueprints/` | The skill Claude loads for structural work: `SKILL.md` (agent JSON contract, validator rules, healthcare voice conventions, minimal edits, skeleton-first build) and `blueprints/*.json` example agents. |
| `system_prompt.md` | Persona and turn protocol. Replaces Claude Code's default prompt. |
| `events.py` | Pure helpers: step labels, node name of an edit, which drafts are worth a `draft` event. |
| `runner.py` | `run_turn(agent_id, message, agent)`: yields `step`, `text`, `draft`, `proposal`, `done` or `error` events; keeps the session id per agent (`reset_session`). |

Auth is whatever the `claude` CLI uses: its login, or `ANTHROPIC_API_KEY` if set (leave it unset to use the subscription). `COPILOT_MODEL` overrides the model.

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
