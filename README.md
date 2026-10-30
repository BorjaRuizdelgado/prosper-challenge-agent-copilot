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
make demo   # seed the three demo agents (see Layout, `backend/demo/`); re-run to reset them
make test   # pytest + Vitest + Playwright smoke spec (the call is faked; a real call needs a mic and the OpenAI and ElevenLabs keys)
```

Open `http://localhost:5173`: the home page lists the agents; an agent opens in the editor, where the agent's name in the top bar opens a switcher (new, rename, duplicate, delete) and the tabs in the middle switch between **Build**, **Test call** and **Runs**. The Copilot sits in its own panel on the left (toggle it from the top bar, ⌘K puts the cursor in it); the right panel belongs to the current tab. Agents are JSON files in `backend/agents/` (git-ignored; an agent built from a client's guidelines also has `<id>.guidelines.md` beside its JSON, served by `GET`/`PUT /api/agents/{id}/guidelines`, up to 50 KB, and `POST /api/agents` takes an optional `guidelines`; `GET /api/demo/guidelines` serves the sample guidelines from `backend/demo/guidelines/`; seeded from `example_flow.json` on first run). Run pieces separately with `make api` / `make frontend`.

### Editing the graph

- **Nodes:** *Add node* on the canvas creates an empty `new_node`; select a node to edit it in the Build panel (the back arrow returns to the agent). There you can *Set as initial* or *Delete node*. Deleting states how many edges from other nodes will be removed with it; the initial node (and the last remaining node) cannot be deleted, so pick another initial node first.
- **Node actions:** *Pre-actions* run when the conversation enters a node, *Post-actions* after the agent's reply. Each step is *Say* (`tts_say`, speaks the text word for word) or *End call* (`end_conversation`, with an optional goodbye), plus whether the text joins the conversation history. These are the only actions the JSON format can express; any other action is shown read-only. A node marked *Ends the call* hangs up by itself, but custom post-actions replace that, so the form asks for an *End call* step.
- **Parameters:** each collected parameter has a name, type (string, number, integer, boolean or list with an item type), description, optional allowed values (stored as numbers for number types) and a required flag. Other JSON-schema keywords and nested `object` schemas are kept as they are and edited in the JSON view.
- **Edges:** each edge is an LLM tool, so its function name may only use letters, digits, `_` and `-` (max 64). Drag from a card's handle to another node to connect, drag an edge end to retarget, select and press Delete/Backspace to remove.
- **Edge labels:** drag an edge's label (its function name) to pull overlapping labels apart; the offset is relative to the middle of the edge and saved in `layout` under the edge id `node::function`, next to the node positions.
- **Layout:** drag cards to place them. Positions are saved with the agent as `layout` when you press *Save*. *Auto layout* re-arranges everything (top to bottom), resets label offsets and marks the agent unsaved; nodes without a saved position (e.g. added by hand in the JSON) are laid out automatically on load.
- **Agent settings** (Build, nothing selected): agent name, persona (applies to every node), voice and model. Voice and model are picked from a curated list (`frontend/src/options.ts`) or set to *Custom…* to type any ElevenLabs voice id / model name.
- **Checks** (Build, nothing selected; the error or warning count in the top bar opens them): after edits settle (~400 ms) the working copy, saved or not, is sent to `POST /api/agents/validate`, the same rules `AgentBuilder` enforces. Errors (e.g. an edge to a missing node, a missing name or description, a function name the LLM cannot use as a tool, a list parameter without an item type, an action the runtime cannot run) and warnings (unreachable node, no terminal node, dead end, node without task messages, untyped or undefined parameter, a terminal node whose post-actions skip the hang-up) are listed; clicking one selects the node or edge, which also carries a red/amber `!` marker. Errors will block starting a test call. If the request fails the list says it may be stale.
- **JSON view** (the Graph / JSON switch on the canvas): the whole agent, including `layout`, as editable JSON. *Apply* replaces the graph and marks it unsaved; malformed JSON (with the line when the browser reports one) or the wrong shape is rejected and the graph is left untouched. *Discard* returns to the current graph.

### Test call

The **Test call** tab talks to the agent you are editing, from the browser (needs `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` in `backend/.env` and the voice runner on :7860, which `make dev` starts).

- **Test call** asks for the microphone, starts a session for this agent's id and shows *Connecting… → Live*. Mute and *Hang up* are available while live. A dirty agent shows **Save and call**: the call always runs the saved version. Blocking issues disable the button and say why.
- **Transcript:** your words and the agent's, alternating, plus a note for the first node and every transition with the data collected. It stays after hang-up until the next call.
- **Canvas:** the node the call is in gets a teal outline and the last edge taken is coloured; both clear when the call ends.
- **Failures:** mic denied returns to *Ready* with instructions; a backend that is down, or one that cannot start the session (unknown id, missing keys), shows *Call failed* with a *Retry* button. The runner cannot report setup errors back before a session exists, so those show up in the browser as a ~20 s timeout and in the runner log as the real reason.

How it works: the browser `POST`s `/voice/start` (proxied to the runner) with `{"body": {"agent_id": ...}}`, the Pipecat client then connects over SmallWebRTC, and `bot.py` loads that agent. Transitions travel as an RTVI server message `{"type": "node_changed", "from", "node", "via", "args"}` (`backend/session.py`).

### Copilot

Setup: the copilot drives the local [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI through the Claude Agent SDK, which is installed with `make install`. You need the `claude` CLI on your PATH and **either** of:

- a login: run `claude` once in a terminal and sign in (uses your subscription, no per-token billing), **or**
- `ANTHROPIC_API_KEY` in `backend/.env` (per-token billing). **Leave it unset to use the subscription**: when set, it wins over the login.

Restart the API after changing either. The model defaults to Haiku (cheapest); set `COPILOT_MODEL` (e.g. `sonnet`) to override. Without a login or key the panel shows a setup message and the rest of the editor keeps working. The Copilot does not need the OpenAI or ElevenLabs keys; a test call does. The click path for the live demo is in the [demo walkthrough](solution.md#demo-walkthrough).

The **Copilot** panel chats with an AI that edits the open agent (backend: `backend/copilot/`, endpoints `POST /api/copilot/{id}` and `/reset`).

- **Chat:** describe what you want (or pick an example); Enter sends, Shift+Enter adds a line. Each agent keeps its own conversation, also across a page reload (kept in the browser's local storage; a turn cut off by the reload shows as *Stopped*, and a pending proposal comes back with its draft on the canvas); *New chat* clears it and the server-side session.
- **Progress:** a *Working… Ns* indicator with a timer shows the moment you send, then one line per step (reading, editing a node, validating) and the reply as it is written. The input is disabled during a turn; *Stop* aborts it and keeps what was streamed.
- **Setup:** the copilot drives the local `claude` CLI. If there is no login and no `ANTHROPIC_API_KEY`, the panel says so and the rest of the editor keeps working.
- **Canvas focus:** the node a step is reading or editing gets a pulsing teal outline (same colour as a call's active node) until the turn ends or is stopped.
- **Proposal card:** when the copilot changes the agent, its reply carries a card with counts ("1 node added, 1 edge changed"), any validation issues left, a collapsed *Changes* list (expand an item for its before/after text), *Apply* and *Discard*. Apply loads the proposal into the editor as unsaved changes (you still Save), keeps the positions of nodes that stay and lets new nodes be auto-laid out; if you edited the agent after the proposal arrived it asks first. Discard leaves the editor as it was. A proposal with errors says the agent will not be callable until they are fixed.
- **Ask Copilot (fix from a call):** when a test call has ended with a transcript, the Test call tab shows *Ask Copilot*. It opens the Copilot panel with the transcript, a `Path: greeting -> collect_details -> …` line from the call's transitions and `What went wrong: ` in the input, cursor at the end. Nothing is sent until you finish the sentence and press Send; the reply is an ordinary proposal. It is not shown when nobody spoke.
- **Live draft on the canvas:** from the copilot's first edit the canvas shows its draft instead of your working copy and redraws after every edit. Added nodes and edges are green (new nodes fade in), changed ones amber (they flash once), removed ones faded and dashed. Nodes you already had keep their positions; only new nodes are laid out. The canvas is read-only meanwhile, and clicking a node or edge opens it read-only in the Build panel. Your working copy and the unsaved marker are untouched until you Apply. A banner says *Copilot draft…* while it works and offers *Apply*, *Discard* and *Hide* when it is done (Hide shows your working copy again and keeps the proposal card pending). Stopping or an error also restores the working copy.
- **New from guidelines:** the home page and the agent switcher offer *New from guidelines* next to *New agent*: a dialog with a name, a text area, a `.md`/`.txt` file (dropped on the text area or chosen; other types are rejected with a message) and one *Use sample: <name>* button per sample (the small *Harbor Dental Reschedule* first, then the larger *Maple Family Practice*; picking one fills the text and the name, unless you already typed a name). *Create and build* creates the agent with the guidelines (max 50 KB), opens its editor and the Copilot, and sends the fixed request *Build this agent from the client's guidelines.* The chat shows a *Guidelines: name · N words* chip, not the text.
- **Client guidelines in settings:** with nothing selected, Build's *Agent settings* ends with a *Client guidelines* section: the stored text with its word count, *Edit* (Save/Cancel; saving does not touch the graph or the unsaved marker), *Add guidelines* when there are none, and *Check coverage*, which opens the Copilot and sends the fixed request *Check this agent against the client's guidelines and report coverage. Do not change the agent.*
- **Coverage card:** when the copilot reports coverage (after a build from guidelines, *Check coverage*, or after you paste the client's answers), the reply carries a card above the proposal: a count line ("Covers 14 of 16 requirements · 4 questions for the client", where *covered* and *covered with a default* both count), the requirements grouped as *Covered*, *Covered with a default* and *Open*, each with the node chips that implement it (hovering a chip or a row focuses the node on the canvas, clicking a chip selects it in Build; the source quote is the row's tooltip), and *Questions for the client* with the default the agent follows. *Copy as email* copies the numbered questions, each with its default, as a short message to the client and shows a toast. *Re-check coverage* sends the fixed check request. *Use sample client reply* appears only when the agent's guidelines are a sample's text; it fills the canned client email into the input and does not send it. The report is saved with the chat, so it survives a reload.

### Client guidelines (demo)

Two samples ship with the dialog. **Harbor Dental, reschedule line** is the one to try first: one page, seven rules and two deliberate gaps (no cancellation notice window, no front-desk number), so a correct build is checkable by eye: about seven requirements, two questions with safe defaults, and after *Use sample client reply* and *Send* no questions left. **Maple Family Practice** is the larger, realistic one (about 640 words, many more requirements and questions, varying per run).

```bash
make dev    # open http://localhost:5173, New from guidelines, Use sample: Harbor Dental Reschedule, Create and build
make check-guidelines MODEL=sonnet   # optional: check a real build against the sample's expectations (needs the claude CLI)
```

### Production runs (demo)

The **Runs** tab shows what happened in an agent's past phone calls and lets the Copilot learn from them. There is no call recording: the runs are hand-written fixtures in `backend/demo/runs/<agent id>.json`, served read-only by `GET /api/agents/{id}/runs`. An agent without a file has no runs.

```bash
make demo   # writes three demo agents (a scheduler, a refill line, a billing line) into backend/agents/, replacing any with the same id
make dev    # then open http://localhost:5173 and pick one of the demo agents
```

- **Runs tab:** counts per outcome (completed, transferred, abandoned, stuck) and how many are flagged, then the runs newest first with outcome, time, duration, the caller's first line and any flag. Selecting a run opens its transcript, the transitions and the path, and draws the path on the canvas (visited nodes outlined, taken edges coloured, the last node dashed). Nodes that no longer exist are labelled *missing*. Leaving the tab closes the run. A copilot draft or a live call takes precedence on the canvas.
- **Analyze runs:** opens the Copilot panel and sends *Review this agent's production runs…* with the working copy. The Copilot reads the runs (`workspace/runs/<id>.txt`, only its own agent's), groups them by cause, reports findings, and edits the agent. The reply carries a **Findings** card above the usual proposal: title, cause, fix and the run ids, which open that run in the Runs tab; hovering a finding focuses its node on the canvas. Apply and Save work as usual. Run `make demo` again to reset.
- **Ask Copilot** on an open run prefills the input with its transcript, path, outcome, flag and `What went wrong: `, like after a test call; nothing is sent until you do.
- **Run goals:** every demo run in `backend/demo/runs/*.json` has a one-sentence `goal` (what the caller wanted). It is not shown in the UI; the replay feature uses it to play the caller.
- **Replay API:** `POST /api/agents/{id}/replay` replays runs as text with a simulated caller against a base agent and, optionally, a proposal (without one only the *before* replay runs), streaming `started`, `result`, `error` and `done` events (see `backend/replay/README.md`). It needs `OPENAI_API_KEY` in `backend/.env`; without it the endpoint reports a setup error. In the UI: `frontend/src/replay/` holds the SSE client, `selectRuns` (which runs to replay), `scoreReplay` (fixed / kept / broken / not reproduced) and `replayView` (the open card row and the single-call replay, and the canvas path overlay); the copilot store keeps each proposal's results on its assistant message and starts a replay when a turn ends with findings and a proposal. Under the proposal, the **Replay card** (`ReplayCard.tsx`, labelled "Simulated text calls") shows a summary like "Fixed 5 of 6 failing calls · 3 of 3 working calls still work", one row per call (original outcome, before → after, reason, verdict) with Retry on a failed row, and a **Replay calls** button when nothing was replayed yet; opening a row shows the *after* transcript and draws its path on the proposal on the canvas. In an open run of the Runs tab, **Replay this call** replays that run against the working copy and shows outcome, goal, reason and transcript, drawing the path on the canvas; it is disabled while a copilot draft is on the canvas.

- **Demo check:** `make demo-check` (after `make demo`, needs `OPENAI_API_KEY` in `backend/.env`; exits 1 without it) replays every demo run against its seeded agent, *before* only, and prints `run · original · replay · goal met · reason`. Use it to warm up and to check the key before a demo; `ARGS='--agent demo-riverside-scheduler --run r-1004'` limits it (each run is about 15 small `gpt-4o-mini` calls plus the agent's own model).

Try it: `make demo`, open *Sunrise Pharmacy Refills* (`demo-sunrise-refills`), Runs tab, **Analyze runs**, wait for the findings and the proposal, **Apply**. Needs the same Claude login or key as the Copilot.

## Layout

| Path | Responsibility |
| --- | --- |
| `backend/bot.py` | The voice pipeline (WebRTC + ElevenLabs STT/TTS + OpenAI LLM). Loads an agent JSON via `AgentBuilder` and runs it. No graph logic lives here. |
| `backend/agent_builder/` | All agent-building code. `schema.py` = the declarative `AgentConfig` / `Node` / `Edge` contract; `builder.py` = `AgentBuilder`, which loads + validates the JSON and compiles it into a Pipecat Flows graph. |
| `backend/session.py` | Call setup helpers with no Pipecat imports: read `agent_id` from the session body, load the agent (refusing unknown ids and blocking issues), check API keys, build the `node_changed` message. |
| `backend/api/` | FastAPI app that lists/edits agent JSON files in `backend/agents/` for the UI. |
| `backend/demo/` | Demo data for the production-runs review: three flawed agents (`agents/`), about 8 hand-written mocked runs each (`runs/<agent id>.json`, served read-only by `GET /api/agents/{id}/runs`) `guidelines/` (sample client guidelines for the *Use sample: ...* buttons, each with a client reply, and for the small one an `.expected.json`; `check_build.py` checks a real build against it) and `seed.py` (`make demo`), which writes the agents into the agents store, with the scheduler's guidelines (`agents/<id>.guidelines.md`), and replaces any with the same id. |
| `frontend/` | Vite + React + TypeScript agent builder UI. `src/call/` holds the voice client wrapper and the call store (state machine, transcript, active node). `src/copilot/` holds the copilot SSE client, chat store and `diffAgents`. `src/replay/` holds the replay client and the selection and scoring functions. |
| `frontend/e2e/` | Playwright smoke spec (`npm run e2e` in `frontend/`); starts its own API on :8100 with a temp agents dir and Vite on :5180, so it does not clash with `make dev`. |
| `backend/copilot/` | The Copilot engine: Claude Code via the Agent SDK on a draft file, path guard, `validate_agent` tool, system prompt and the Prosper Blueprints skill. See its README. |
| `solution.md` | The argument: the problem, the Copilot's two loops, the demo walkthrough, architecture, decisions, what was built / mocked / left out, and next steps. |
| `backend/example_flow.json` | The example agent **as data** — a clinic scheduler. The artifact the Phase 2 Copilot generates/edits. |

`bot.py` runs the agent whose id the session is started with (`{"agent_id": ...}` in the `/start` body); there is no hardcoded agent. `backend/session.py` loads it, refuses unknown ids and agents with blocking issues, and checks the API keys.