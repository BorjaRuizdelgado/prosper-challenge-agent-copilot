# Prosper Challenge — Agent Composer

Voice AI for healthcare scheduling. An agent is a **graph of nodes** (Pipecat Flows), defined declaratively as JSON and compiled into a runnable voice pipeline.

- **Phase 1** — a UI to edit the node graph and place a test call.
- **Phase 2** — an AI Composer that generates and iterates on agents from natural language.

```
browser mic  ->  ElevenLabs STT  ->  OpenAI LLM  ->  ElevenLabs TTS  ->  browser
```

Calls are started from the agent builder UI (see below), which tells the voice runner which agent to run.

## Quickstart

Requires **Python 3.11+** and [**uv**](https://docs.astral.sh/uv/getting-started/installation/) (uv will fetch a matching Python for you if needed). Run from the repo root:

```bash
make install   # uv sync — creates backend/.venv and installs from uv.lock
make run       # uv run python bot.py
```

This starts the voice runner on :7860. A call needs an agent id, so start it from the builder UI below (the prebuilt `/client` page does not send one). `Ctrl+C` to stop. (`make help` lists all targets.)

Prefer raw `uv`? The same commands without `make`:

```bash
uv sync --directory backend            # install dependencies
uv run --directory backend python bot.py   # run the agent
```\
\
Remember to update the `.env` file accordingly.

## Agent builder UI (Phase 1, in progress)

Needs **Node 20+** in addition to the above.

```bash
make up     # install + create .env + start everything
make down   # stop all services
make dev    # agents API :8000 + voice runner :7860 + Vite :5173
make test   # pytest + Vitest
```

Open `http://localhost:5173`. Agents are JSON files in `backend/agents/` (git-ignored; seeded from `example_flow.json` on first run). Run pieces separately with `make api` / `make frontend`.

### Editing the graph

- **Nodes:** *Add node* in the editor bar creates an empty `new_node`; select a node to edit it in the Inspector. There you can *Set as initial* or *Delete node*. Deleting states how many edges from other nodes will be removed with it; the initial node (and the last remaining node) cannot be deleted, so pick another initial node first.
- **Edges:** drag from a card's handle to another node to connect, drag an edge end to retarget, select and press Delete/Backspace to remove.
- **Edge labels:** drag an edge's label (its function name) to pull overlapping labels apart; the offset is relative to the middle of the edge and saved in `layout` under the edge id `node::function`, next to the node positions.
- **Layout:** drag cards to place them. Positions are saved with the agent as `layout` when you press *Save*. *Auto layout* re-arranges everything (left to right), resets label offsets and marks the agent unsaved; nodes without a saved position (e.g. added by hand in the JSON) are laid out automatically on load.
- **Settings tab:** agent name, persona (applies to every node), voice and model. Voice and model are picked from a curated list (`frontend/src/options.ts`) or set to *Custom…* to type any ElevenLabs voice id / model name.
- **Issues tab:** after edits settle (~400 ms) the working copy, saved or not, is sent to `POST /api/agents/validate`, the same rules `AgentBuilder` enforces. Errors (e.g. an edge to a missing node) and warnings (unreachable node, no terminal node, dead end) are listed; clicking one selects the node or edge, which also carries a red/amber `!` marker. Errors will block starting a test call. If the request fails the tab says the list may be stale.
- **JSON tab:** the whole agent, including `layout`, as editable JSON. *Apply* replaces the graph and marks it unsaved; malformed JSON (with the line when the browser reports one) or the wrong shape is rejected and the graph is left untouched. *Discard* returns to the current graph.

## Layout

| Path | Responsibility |
| --- | --- |
| `backend/bot.py` | The voice pipeline (WebRTC + ElevenLabs STT/TTS + OpenAI LLM). Loads an agent JSON via `AgentBuilder` and runs it. No graph logic lives here. |
| `backend/agent_builder/` | All agent-building code. `schema.py` = the declarative `AgentConfig` / `Node` / `Edge` contract; `builder.py` = `AgentBuilder`, which loads + validates the JSON and compiles it into a Pipecat Flows graph. |
| `backend/api/` | FastAPI app that lists/edits agent JSON files in `backend/agents/` for the UI. |
| `frontend/` | Vite + React + TypeScript agent builder UI. |
| `backend/example_flow.json` | The example agent **as data** — a clinic scheduler. The artifact the Phase 2 Composer generates/edits. |

`bot.py` runs the agent whose id the session is started with (`{"agent_id": ...}` in the `/start` body); there is no hardcoded agent. `backend/session.py` loads it, refuses unknown ids and agents with blocking issues, and checks the API keys.