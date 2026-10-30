# replay

Text simulator that replays a production run against an agent graph (openspec change `1-replay-runs-against-fix`). Backend tests never call OpenAI: they pass a scripted fake `ChatClient`.

| Module | Role |
| --- | --- |
| `nodes.py` | Per-node system text, task messages, tools and actions from `AgentConfig`; kept in parity with `AgentBuilder._make_node` by `tests/test_replay_nodes.py`. |
| `simulator.py` | `replay(agent, caller, chat_client, max_turns=20)`: the agent speaks first, edge calls move to the target and are recorded in `path`, `tts_say` is verbatim, `end_conversation` / `end` nodes end the call, the turn limit gives `stuck`, `[HANGUP]` from the caller ends it. |
| `caller.py` | Simulated caller (`gpt-4o-mini`, temperature 0.4) seeded with the original caller lines and the run's `goal` (or a cached one-line summary). |
| `judge.py` | `gpt-4o-mini` JSON-schema verdict `{outcome, goal_met, reason}`; the turn limit forces `stuck`, an emergency instruction followed by a hang-up forces `transferred` with the goal met. |
| `runner.py` | `replay_run(agent, run)`: goal, simulator and judge for one run against one agent dict; returns `{transcript, path, outcome, goal_met, reason}`. |
| `client.py` | `ChatClient` protocol and the `OpenAIChatClient` (reads `OPENAI_API_KEY`). |

## API

`POST /api/agents/{id}/replay` (`backend/api/replay.py`) with body `{base, proposal?, run_ids}`. Every run id is replayed against `base` (version `before`) and, when `proposal` is given, `proposal` (version `after`); without it only `before` runs (the *Replay this call* button), up to 4 jobs in parallel. The response is `text/event-stream`:

| Event | Data |
| --- | --- |
| `started` | `{run_id, version}` |
| `result` | `{run_id, version, transcript, path, outcome, goal_met, reason}` |
| `error` | `{run_id?, version?, message, setup}`; a failed job only fails itself, `setup: true` means no job was started |
| `done` | `{}` |

Unknown run ids (not in `GET /api/agents/{id}/runs`) get `400`. A client disconnect cancels the pending jobs. Endpoint tests inject a fake replay function (`get_replay_fn`) so they never call OpenAI.

## Key

Replay needs `OPENAI_API_KEY`. `api/app.py` loads `backend/.env` (real environment variables win). Without a key the endpoint sends one `error` with `setup: true`, then `done`. Cached one-line goals for runs without a `goal` go to `backend/.replay-cache/goals.json` (git-ignored).
