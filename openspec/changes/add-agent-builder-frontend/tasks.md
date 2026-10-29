# Tasks

Each group is a vertical slice that ends with something usable and verified in the running app. Tests and docs land in the group that owns the work. Hackathon mode: laptop-width only (no mobile), tests only where logic is non-trivial, and per-slice Playwright specs are replaced by one smoke spec (task 9.3) plus manual checks.

## 1. Walking skeleton: API + app shell + agent list (read)

- [x] 1.1 Spike Pipecat contract: with a throwaway script confirm `POST /start` body reaches `runner_args.body`, RTVI is emitted by default, and a custom server message can be pushed; record findings in `design.md` Decisions 7–9 (adjust if wrong). Verify: notes committed and a stub bot logs the received `agent_id`.
- [x] 1.2 Backend: add `backend/api/` FastAPI app with `GET /api/agents` over `backend/agents/*.json`, seed from `example_flow.json` when empty, id validation helper, and `fastapi`/`pytest`/`httpx` deps via `uv`. Verify: `uv run pytest` covers seed, listing, and rejected ids (`../x`, uppercase).
- [x] 1.3 Frontend: scaffold `frontend/` (Vite, React, TS, router, Vitest, CSS tokens + IBM Plex from the dealt `framed-sheet` style), app shell (tinted frame, sidebar with product mark, white sheet), Vite proxies `/api` and `/voice`. Verify: `npm run build` and `npm test` pass; shell renders at laptop width.
- [x] 1.4 Sidebar lists agents from the API with loading, empty and error+retry states and routes `/agents/:id` to a placeholder editor. Verify: Vitest for the three states; manual check in the browser.
- [x] 1.5 Makefile: `api`, `frontend`, `dev` (all three processes), `test`; update `README.md` quickstart and `.gitignore` (`frontend/node_modules`, `frontend/dist`, `.taste-skill/`, `backend/agents/` runtime files except the seed policy). Verify: `make dev` serves the list at the Vite URL.

## 2. Agent lifecycle (create, rename, duplicate, delete)

- [x] 2.1 Backend: `POST /api/agents` (name → starter agent), `GET/PUT/DELETE /api/agents/{id}`, `POST /api/agents/{id}/duplicate`, atomic writes, 404s. Verify: pytest for each route, including failed-write leaves the old file and unknown id → 404.
- [x] 2.2 Frontend: "New agent" dialog, rename, duplicate, delete with confirmation, navigation to the new agent URL, optimistic list refresh and error toasts. Verify: Vitest for the dialogs; manual check in the browser.

## 3. Read-only graph of an agent

- [x] 3.1 Backend: structured validation `validate(data) -> issues` in `agent_builder` (codes in design Decision 3), used by `AgentBuilder` (raises if any error) and `POST /api/agents/validate`; `schema.py` preserves an optional `layout`. Verify: pytest table of invalid agents → expected issue codes; example_flow yields none.
- [x] 3.2 Frontend: typed `Agent` model, API client, Zustand agent store loading the working copy, dagre auto layout, React Flow canvas with custom Node card (name, task summary, initial/terminal marks, handle per edge) and labelled edges, fit-to-view, zoom/minimap controls. Verify: Vitest for layout (no overlaps, saved positions respected); manual check in the browser.
- [x] 3.3 Selection: clicking a node or edge selects it and opens the dock Inspector (read-only fields for now); dock tab registry in place with `Inspector` only. Verify: Vitest that selection updates the dock; manual check in the browser.

## 4. Edit and save nodes

- [x] 4.1 Store actions `updateNode`, `renameNode` (cascades to edge targets, `initial_node`, `layout`; rejects blank/duplicate), dirty tracking, and unit tests for each. Verify: `npm test` covers the rename cascade and duplicate refusal.
- [x] 4.2 Inspector node form: name, task messages (add/remove/reorder, role+content), role override, terminal toggle, pre/post actions as validated JSON blocks. Verify: Vitest form tests; manual check in the browser.
- [x] 4.3 Save flow: Save button + status (saved/unsaved/saving/failed), `PUT` with positions, keyboard shortcut, `beforeunload` and router-leave warning, failure keeps dirty state with retry. Verify: manual check that edit, save and reload persist text and position, and that stopping the API shows the failure state.

## 5. Edit edges and collected parameters

- [x] 5.1 Store actions for `addEdge`, `updateEdge`, `removeEdge`, `retargetEdge` (unique function names) with unit tests. Verify: `npm test`.
- [x] 5.2 Inspector edge form: function, description, target select, parameter rows (name, type, description, enum values, required) writing `properties`/`required`. Verify: Vitest produces the expected JSON for a string+enum required parameter; manual check in the browser.
- [x] 5.3 Canvas interactions: drag handle-to-node to connect, drag edge end to retarget, delete key on selected edge. Verify: manual check in the browser.

## 6. Structural graph editing and layout

- [x] 6.1 Add node (toolbar, with unique default name) and delete node with confirmation stating how many incoming edges go; block deleting the initial node until another is chosen; "Set as initial". Verify: Vitest for cascade and guards; manual check in the browser.
- [x] 6.2 Persist dragged positions in `layout`, "Auto layout" button, unlayouted nodes (e.g. added via JSON) are laid out on load. Verify: manual check that a moved node keeps its position after save and reload, and auto layout resets it.

## 7. Agent settings, validation feedback and JSON view

- [x] 7.1 Settings form (name, persona, voice select with curated ElevenLabs voices + custom id, model select + custom). Verify: Vitest; manual check in the browser.
- [x] 7.2 Debounced validation via `/api/agents/validate`: Issues dock tab with errors/warnings, markers on affected nodes/edges, clear "No issues" state, issue click selects the element. Verify: manual check in the browser.
- [x] 7.3 JSON dock tab: editable view of the working agent, Apply button, parse/shape errors with line info, graph unchanged on failure, successful apply marks dirty. Verify: Vitest for good/bad JSON; manual check in the browser.

## 8. Test call (voice end to end)

- [x] 8.1 Backend: `bot.py` loads agent by `agent_id` from the session body via the shared id validation, refuses blocking issues, clear failure messages for unknown id and missing API keys; remove `AGENT_FLOW`. Verify: pytest for the loader helper (valid, unknown, traversal, blocking); manual: runner starts with the example agent id.
- [x] 8.2 Backend: `AgentBuilder(on_transition=...)`; `bot.py` emits RTVI server message `node_changed` for the initial node and every transition including collected args. Verify: pytest with a fake callback; manual log shows messages.
- [x] 8.3 Frontend: Pipecat client provider, `Call` dock tab with state machine (idle/connecting/live/ended/failed), mic permission handling, mute, hang up, "Save and call" for dirty agents, disabled with reason when blocking issues. Verify: Vitest for the state machine with a mocked client; manual call to the example agent works.
- [x] 8.4 Live transcript (user/agent alternation, persists after hang-up) and transition notes in the transcript. Verify: Vitest feeding mocked RTVI events; manual call shows both sides.
- [x] 8.5 Active node highlight and last transition on the canvas, cleared at call end; the call panel docks beside the graph without hiding it. Verify: Vitest for store `activeNode`; manual call walks greeting → confirm with highlights; manual check in the browser.
- [ ] 8.6 Write `docs/manual-call-test.md` (keys, steps, expected results for success, mic denied, backend down, unknown id). Verify: another run-through follows it verbatim.

## 9. Polish and hand-off

- [ ] 9.1 Quick look-and-fix at laptop width only (1440 and 1280): consistent gutters, empty/error/loading states, visible focus. No inspector gate, no mobile. Verify: screenshots look clean and no console errors.
- [ ] 9.2 Docs: update `README.md` (layout, run, test), add the architecture and key decisions section to `solution.md` (what was built, mocked, left out and why), note extension points for the Copilot (store actions, dock registry, agent JSON contract, RTVI messages). Verify: a fresh clone follows README to a running demo.
- [ ] 9.3 Final integration: full demo script run (create agent → edit nodes/edges → fix a validation error → save → test call → watch active node) plus `make test` green (pytest, Vitest, the Playwright smoke spec). Verify: all suites pass and the demo script completes without console errors.
