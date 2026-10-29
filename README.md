# Prosper Challenge — Agent Copilot

Voice AI for healthcare scheduling. An agent is a **graph of nodes** (Pipecat Flows), defined declaratively as JSON and compiled into a runnable voice pipeline.

- **Phase 1** — a UI to edit the node graph and place a test call.
- **Phase 2** — an AI Copilot that generates and iterates on agents from natural language.

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
```

Remember to update the `.env` file accordingly.

## Agent builder UI (Phase 1)

Needs **Node 20+** in addition to the above.

```bash
make up     # install + create .env + start everything
make down   # stop all services
make dev    # agents API :8000 + voice runner :7860 + Vite :5173
make test   # pytest + Vitest + Playwright smoke spec (the call is faked; see docs/manual-call-test.md for the real one)
```

Open `http://localhost:5173`. Agents are JSON files in `backend/agents/` (git-ignored; seeded from `example_flow.json` on first run). Run pieces separately with `make api` / `make frontend`.

### Editing the graph

- **Nodes:** *Add node* in the editor bar creates an empty `new_node`; select a node to edit it in the Inspector. There you can *Set as initial* or *Delete node*. Deleting states how many edges from other nodes will be removed with it; the initial node (and the last remaining node) cannot be deleted, so pick another initial node first.
- **Node actions:** *Pre-actions* run when the conversation enters a node, *Post-actions* after the agent's reply. Each step is *Say* (`tts_say`, speaks the text word for word) or *End call* (`end_conversation`, with an optional goodbye), plus whether the text joins the conversation history. These are the only actions the JSON format can express; any other action is shown read-only. A node marked *Ends the call* hangs up by itself, but custom post-actions replace that, so the form asks for an *End call* step.
- **Parameters:** each collected parameter has a name, type (string, number, integer, boolean or list with an item type), description, optional allowed values (stored as numbers for number types) and a required flag. Other JSON-schema keywords and nested `object` schemas are kept as they are and edited in the JSON tab.
- **Edges:** each edge is an LLM tool, so its function name may only use letters, digits, `_` and `-` (max 64). Drag from a card's handle to another node to connect, drag an edge end to retarget, select and press Delete/Backspace to remove.
- **Edge labels:** drag an edge's label (its function name) to pull overlapping labels apart; the offset is relative to the middle of the edge and saved in `layout` under the edge id `node::function`, next to the node positions.
- **Layout:** drag cards to place them. Positions are saved with the agent as `layout` when you press *Save*. *Auto layout* re-arranges everything (left to right), resets label offsets and marks the agent unsaved; nodes without a saved position (e.g. added by hand in the JSON) are laid out automatically on load.
- **Settings tab:** agent name, persona (applies to every node), voice and model. Voice and model are picked from a curated list (`frontend/src/options.ts`) or set to *Custom…* to type any ElevenLabs voice id / model name.
- **Issues tab:** after edits settle (~400 ms) the working copy, saved or not, is sent to `POST /api/agents/validate`, the same rules `AgentBuilder` enforces. Errors (e.g. an edge to a missing node, a missing name or description, a function name the LLM cannot use as a tool, a list parameter without an item type, an action the runtime cannot run) and warnings (unreachable node, no terminal node, dead end, node without task messages, untyped or undefined parameter, a terminal node whose post-actions skip the hang-up) are listed; clicking one selects the node or edge, which also carries a red/amber `!` marker. Errors will block starting a test call. If the request fails the tab says the list may be stale.
- **JSON tab:** the whole agent, including `layout`, as editable JSON. *Apply* replaces the graph and marks it unsaved; malformed JSON (with the line when the browser reports one) or the wrong shape is rejected and the graph is left untouched. *Discard* returns to the current graph.

### Test call

The **Call** tab talks to the agent you are editing, from the browser (needs `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` in `backend/.env` and the voice runner on :7860, which `make dev` starts).

- **Test call** asks for the microphone, starts a session for this agent's id and shows *Connecting… → Live*. Mute and *Hang up* are available while live. A dirty agent shows **Save and call**: the call always runs the saved version. Blocking issues disable the button and say why.
- **Transcript:** your words and the agent's, alternating, plus a note for the first node and every transition with the data collected. It stays after hang-up until the next call.
- **Canvas:** the node the call is in gets a teal outline and the last edge taken is coloured; both clear when the call ends.
- **Failures:** mic denied returns to *Ready* with instructions; a backend that is down, or one that cannot start the session (unknown id, missing keys), shows *Call failed* with a *Retry* button. The runner cannot report setup errors back before a session exists, so those show up in the browser as a ~20 s timeout and in the runner log as the real reason.

How it works: the browser `POST`s `/voice/start` (proxied to the runner) with `{"body": {"agent_id": ...}}`, the Pipecat client then connects over SmallWebRTC, and `bot.py` loads that agent. Transitions travel as an RTVI server message `{"type": "node_changed", "from", "node", "via", "args"}` (`backend/session.py`). `docs/manual-call-test.md` is the checklist for the parts that need a mic and paid keys.

### Copilot

Setup: the copilot drives the local [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI through the Claude Agent SDK, which is installed with `make install`. You need the `claude` CLI on your PATH and **either** of:

- a login: run `claude` once in a terminal and sign in (uses your subscription, no per-token billing), **or**
- `ANTHROPIC_API_KEY` in `backend/.env` (per-token billing). **Leave it unset to use the subscription**: when set, it wins over the login.

Restart the API after changing either. `COPILOT_MODEL` overrides the model. Without a login or key the tab shows a setup message and the rest of the editor keeps working. The Copilot does not need the OpenAI or ElevenLabs keys; a test call does. Demo script for trying it: `docs/copilot-demo.md`.

The **Copilot** tab chats with an AI that edits the open agent (backend: `backend/copilot/`, endpoints `POST /api/copilot/{id}` and `/reset`).

- **Chat:** describe what you want (or pick an example); Enter sends, Shift+Enter adds a line. Each agent keeps its own conversation while the page is open; *New chat* clears it and the server-side session.
- **Progress:** a *Working… Ns* indicator with a timer shows the moment you send, then one line per step (reading, editing a node, validating) and the reply as it is written. The input is disabled during a turn; *Stop* aborts it and keeps what was streamed.
- **Setup:** the copilot drives the local `claude` CLI. If there is no login and no `ANTHROPIC_API_KEY`, the panel says so and the rest of the editor keeps working.
- **Canvas focus:** the node a step is reading or editing gets a pulsing teal outline (same colour as a call's active node) until the turn ends or is stopped.
- **Proposal card:** when the copilot changes the agent, its reply carries a card with counts ("1 node added, 1 edge changed"), any validation issues left, a collapsed *Changes* list (expand an item for its before/after text), *Apply* and *Discard*. Apply loads the proposal into the editor as unsaved changes (you still Save), keeps the positions of nodes that stay and lets new nodes be auto-laid out; if you edited the agent after the proposal arrived it asks first. Discard leaves the editor as it was. A proposal with errors says the agent will not be callable until they are fixed.
- **Ask Copilot (fix from a call):** when a test call has ended with a transcript, the Call tab shows *Ask Copilot*. It opens the Copilot tab with the transcript, a `Path: greeting -> collect_details -> …` line from the call's transitions and `What went wrong: ` in the input, cursor at the end. Nothing is sent until you finish the sentence and press Send; the reply is an ordinary proposal. It is not shown when nobody spoke.
- **Live draft on the canvas:** from the copilot's first edit the canvas shows its draft instead of your working copy and redraws after every edit. Added nodes and edges are green (new nodes fade in), changed ones amber (they flash once), removed ones faded and dashed. Nodes you already had keep their positions; only new nodes are laid out. The canvas is read-only meanwhile, and clicking a node or edge opens it read-only in the Inspector. Your working copy and the unsaved marker are untouched until you Apply. A banner says *Copilot draft…* while it works and offers *Apply*, *Discard* and *Hide* when it is done (Hide shows your working copy again and keeps the proposal card pending). Stopping or an error also restores the working copy.

## Layout

| Path | Responsibility |
| --- | --- |
| `backend/bot.py` | The voice pipeline (WebRTC + ElevenLabs STT/TTS + OpenAI LLM). Loads an agent JSON via `AgentBuilder` and runs it. No graph logic lives here. |
| `backend/agent_builder/` | All agent-building code. `schema.py` = the declarative `AgentConfig` / `Node` / `Edge` contract; `builder.py` = `AgentBuilder`, which loads + validates the JSON and compiles it into a Pipecat Flows graph. |
| `backend/session.py` | Call setup helpers with no Pipecat imports: read `agent_id` from the session body, load the agent (refusing unknown ids and blocking issues), check API keys, build the `node_changed` message. |
| `backend/api/` | FastAPI app that lists/edits agent JSON files in `backend/agents/` for the UI. |
| `frontend/` | Vite + React + TypeScript agent builder UI. `src/call/` holds the voice client wrapper and the call store (state machine, transcript, active node). `src/copilot/` holds the copilot SSE client, chat store and `diffAgents`. |
| `frontend/e2e/` | Playwright smoke spec (`npm run e2e` in `frontend/`); starts its own API on :8100 with a temp agents dir and Vite on :5180, so it does not clash with `make dev`. |
| `docs/` | `copilot-demo.md`: scripted run of the copilot scenarios with what was observed. |
| `backend/copilot/` | The Copilot engine: Claude Code via the Agent SDK on a draft file, path guard, `validate_agent` tool, system prompt and the Prosper Blueprints skill. See its README. |
| `solution.md` | Architecture diagram, what was built / mocked / left out, and extension points for Phase 2. |
| `backend/example_flow.json` | The example agent **as data** — a clinic scheduler. The artifact the Phase 2 Copilot generates/edits. |

`bot.py` runs the agent whose id the session is started with (`{"agent_id": ...}` in the `/start` body); there is no hardcoded agent. `backend/session.py` loads it, refuses unknown ids and agents with blocking issues, and checks the API keys.