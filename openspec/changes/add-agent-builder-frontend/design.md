# Design

## Context

Observed in the repo (see proposal.md for motivation):

- `backend/bot.py` builds a Pipecat pipeline (SmallWebRTC, ElevenLabs STT/TTS, OpenAI) and loads one hardcoded `AGENT_FLOW`. It is started with `python bot.py`, which runs Pipecat's dev runner (FastAPI on :7860, prebuilt UI at `/client`).
- `agent_builder/schema.py` defines `AgentConfig / Node / Edge` dataclasses; `builder.py` validates only two things (initial node exists, edge targets exist) and raises on the first. Unknown JSON keys are ignored by `from_dict`.
- Edges are LLM tool functions with JSON-schema `properties`/`required`; nodes carry `task_messages`, optional `role_message`, `pre/post_actions`, `end`.
- No frontend, no agent storage, no HTTP API, no tests. Node 25 / npm 11 and `uv` are available.
- Not yet verified (spike in task 1.1): the exact Pipecat runner contract for passing per-session data (`POST /start` body → `runner_args.body`), RTVI being enabled by default on `PipelineWorker`, and the SmallWebRTC client transport's endpoint shape.

Visual direction (taste skill, app mode, seed 1752147373): `framed-sheet`, light — a tinted L-frame with a white sheet inset 8px, 1px edge, 16px radius, no shadows, IBM Plex Sans (+ Plex Mono for ids/keys only). Builder pattern: 232px palette/agents panel, canvas as a flat well one tone step darker, nodes of one shared width, 12px radius, 1px hairline. Colour only on the active node, the primary button and status. Product face: a teal accent (`#1b6c80`) and a node-type tile per kind (greeting/collect/end), allowed via `--allow icon-chips` in the inspector.

## Goals / Non-Goals

**Goals:**
- Every capability in `specs/` works end to end through real UI → API → files → voice runtime.
- The agent JSON stays the single contract: UI, runtime and (Phase 2) Copilot read and write the same document.
- Frontend structure that accepts a Copilot chat and more dock tabs without rework.
- Demoable in two commands, robust to bad input (bad JSON, dangling edges, API down, mic denied).

**Non-Goals:**
- Auth, multi-user concurrency control, versioning/history.
- Server-side rendering, i18n, theming toggle (light only), mobile/responsive support (laptop-width desktop only), undo/redo.
- Custom tools/webhooks inside nodes (pre/post actions are edited as JSON).
- Automating the actual voice call in CI (needs mic + paid keys; covered by a manual checklist).

## Decisions

**1. Separate agents API process, not routes inside Pipecat's runner.**
`backend/api/` is a FastAPI app on :8000; the Pipecat runner stays on :7860 untouched. Both read `backend/agents/*.json`. Alternative: inject routes into the runner's app — rejected because the runner app factory is internal to Pipecat and would couple us to its private API. Cost: two processes, solved by `make dev`.

**2. Agents are files: `backend/agents/<id>.json`, id = slug + 4-char suffix, validated by `^[a-z0-9-]{1,64}$`.**
Atomic write (temp file + `os.replace`), listing derives name/node count/mtime from files. Alternative SQLite — rejected as overkill and harder for the Copilot/humans to diff. Last write wins; no ETags (single-user demo), noted as a risk.

**3. Validation is a backend function returning structured issues; the UI calls it.**
`agent_builder.validate(data) -> list[Issue{severity, code, message, node?, edge?}]` powers the API, `AgentBuilder.__init__` (raises if any `error`), and the UI panel (debounced `POST /api/agents/validate` on the working copy). One source of truth instead of porting rules to TS. Error codes: `no-nodes`, `bad-initial`, `unknown-target`, `duplicate-node`, `duplicate-function`, `missing-field` (agent/node name, edge function/description/target), `bad-function-name` (not `^[a-zA-Z0-9_-]{1,64}$`, which OpenAI requires of tool names), `bad-parameters` (`properties` not an object or `required` not a list), `bad-tasks` (`task_messages` not a list); warnings: `unreachable`, `no-terminal`, `dead-end` (non-terminal node without edges), `no-task`, `unknown-required`, `untyped-parameter`. Errors cover every document `AgentBuilder` or the LLM would reject, so "no errors" means the call can start. The JSON tab keeps a small shape check of its own (`agentJson.ts`) only so the canvas never renders a document it cannot draw.

**4. Positions live in the agent JSON as `layout: {nodeName: {x, y}}`.** Dragged edge-label offsets share the map under the edge id (`"node::function"`, offset from the edge midpoint); keys containing `::` are never node names and are ignored by node layout.
Alternative: sidecar file — rejected, it splits one agent over two files. The backend ignores it at runtime. Nodes without a position (e.g. produced by a Copilot) get dagre auto layout on load; "Auto layout" button re-runs it. Node names are the ids (as in the schema), so rename updates `layout`, edge targets and `initial_node` atomically in one store action.

**5. Frontend stack: Vite + React 19 + TypeScript, `@xyflow/react`, `@dagrejs/dagre`, Zustand, plain CSS with tokens, React Router, Vitest.** Playwright is limited to one smoke spec.
React Flow is the de-facto node editor (custom nodes, handles, minimap, controls) and does not constrain Phase 2. Zustand holds the working agent (`AgentConfig` + layout), selection, dirty flag and issues, in a framework-independent store that a Copilot can later patch through the same actions. No component library or Tailwind: the taste rules call for bespoke flat surfaces and the surface area is small; a few headless primitives (Radix Dialog/Select/Tabs) are acceptable if native elements prove insufficient.

**6. Layout: sidebar (agents) + sheet with canvas + right "dock".**
The dock is a tab registry (`Inspector`, `JSON`, `Issues`, `Call`; Phase 2 adds `Copilot`) so adding a chat is registering one component. Selecting a node/edge switches the dock to the Inspector; the call panel docks beside it without hiding the graph so the active node is visible during a call.

**7. Test call uses the Pipecat JS client (`@pipecat-ai/client-react` + `small-webrtc-transport`).**
The browser first `POST`s `/start` on the runner with `{ agent_id }` (via Vite proxy `/voice → :7860`), then connects the transport. Transcript comes from RTVI events (`userTranscript`, `botTranscript`). The same client carries `sendClientMessage`/server messages, which Phase 2 can reuse for text chat. Alternative: iframe the prebuilt `/client` — rejected: no transcript, no node highlighting, no agent selection.

**8. Active node via a custom server message.**
`AgentBuilder` takes an optional `on_transition(from, to, args)` callback; `bot.py` wires it (and the initial node) to push an RTVI server message `{type:"node_changed", node, via, args}`. The UI listens and sets `activeNode`. Alternative: infer from LLM text — rejected as unreliable.

**9. `bot.py` loads the agent by id at session start.**
`bot(runner_args)` reads `runner_args.body["agent_id"]`, loads `agents/<id>.json` through the same id validation, and fails the session with a clear message if missing/invalid/blocking. The hardcoded `AGENT_FLOW` is removed; keys missing from `.env` produce a clear failure instead of a `KeyError`.

**10. Unsaved changes are never called.**
The call button requires a saved, valid agent; with a dirty working copy it offers "Save and call". This guarantees the runtime and the canvas are describing the same agent.

**11. Laptop-only.** Targets a ~1280px+ desktop browser; no responsive layouts. Hackathon scope: minimum that works for a live demo.

**12. Dev topology.** Vite proxies `/api → :8000` and `/voice → :7860` to avoid CORS; production-like check via `vite build && vite preview` (same proxy config). `make dev` runs API, runner and Vite together.

**Spike findings (task 1.1, pipecat-ai 1.4.0, verified by reading the runner source).**
- `POST /start {"body": {...}}` stores `body` under a new `sessionId` (`active_sessions`). The client then posts the WebRTC offer to `/sessions/{sessionId}/api/offer`; the runner fills `request_data` with the stored body and calls `bot(runner_args)` with `runner_args.body == {"agent_id": ...}`. Decision 7/9 hold: the browser sends `agent_id` in the `/start` body and `bot.py` reads `runner_args.body["agent_id"]`. Note the bot starts at offer time, not at `/start`.
- `PipelineWorker(enable_rtvi=True)` is the default: it adds an `RTVIProcessor` and observer itself, so transcripts and bot state events need no pipeline change.
- Custom messages: `worker.rtvi.send_server_message(data)` (or pushing `RTVIServerMessageFrame`) delivers `data` to the client as a server message. Decision 8 holds.
- Verified live: a stub `bot()` under the real runner logged `agent_id='prosper-scheduler'` after `POST /start {"body":{"agent_id":...}}` followed by a real aiortc offer to `/sessions/{id}/api/offer`.
- Intel Macs: pipecat's `onnxruntime`, `numba` and `llvmlite` pins have no macOS x86_64 wheels, so `backend/pyproject.toml` overrides them to older releases (onnxruntime 1.19.2, numba 0.61.2, llvmlite 0.44.0) on that platform. Silero VAD loads and `bot` imports with them.

**Testing strategy (per slice, not at the end):** pytest for API/validation/bot loading helpers; Vitest for the store actions (rename cascade, delete, connect, JSON apply); a single Playwright smoke spec (create → edit → save → reload) against the real API with a temp agents dir; a manual call checklist in `docs/manual-call-test.md`. Component tests only where logic is non-trivial.

## Risks / Trade-offs

- [Pipecat runner contract differs from assumption] → Task 1.1 is a spike that proves `/start` + body + RTVI messages with a stub before any UI depends on it; fall back to a query param or own `/start` route if needed.
- [Paid APIs/mic make the call untestable in CI] → Keep the call layer thin and unit-tested with a mocked client; manual checklist for the real path; a `?fake=1` dev transport is not built (scope).
- [Two writers (UI and, later, Copilot) overwrite each other] → Last-write-wins accepted now; API returns `updated_at` so an ETag/If-Match can be added in Phase 2 without schema change.
- [Name-as-id for nodes makes rename cascades error-prone] → All structural edits go through store actions with unit tests; names are validated unique and non-empty.
- [React Flow bundle weight / dagre layouts jumping] → Fine for a demo; layout runs only on load-without-positions and on explicit "Auto layout".
- [Hand-rolled CSS slows down polish] → Small token set from the dealt style, one shared set of primitives (Button, Field, Pill, Panel).
- [Scope is large (all editing features were requested)] → Slices are ordered so each leaves a working app; later slices (JSON view, polish) can be dropped last without breaking earlier ones.
