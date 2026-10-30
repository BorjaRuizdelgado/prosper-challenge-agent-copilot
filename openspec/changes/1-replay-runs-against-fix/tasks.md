# Tasks

Each group is a vertical slice that ends with something usable and verified. Backend tests never call OpenAI (a fake chat client with scripted replies); real behavior is checked with the demo script in group 5.

## 0. Demo placeholders

- [x] 0.1 Add a one-sentence `goal` to every run in `backend/demo/runs/*.json` and the optional `goal` to the `Run` type in `model.ts`. Verify: `test_demo_runs.py` asserts every demo run has a non-empty `goal`.

## 1. Simulator

- [x] 1.1 `backend/replay/nodes.py`: build each node's system text, developer messages and tool definitions from `AgentConfig`. Verify: a parity pytest against `AgentBuilder._make_node` for the three demo agents and the three blueprints (role message, task messages, function names, descriptions, properties, required).
- [x] 1.2 `backend/replay/simulator.py` `replay(agent, caller, chat_client, max_turns=12)`: agent speaks first, edge calls move to the target and record `{node, via, args}`, `tts_say` spoken verbatim, `end_conversation` and `end` nodes end the call, turn limit → `stuck`, `[HANGUP]` from the caller ends it. Verify: pytest with scripted fake replies for a transition with args, a pre-action, an end node, a dead end that hits the limit, and a hang-up.
- [x] 1.3 `replay/caller.py` (prompt in design Decision 2, goal from the run's `goal` or a cached one-line summary) and `replay/judge.py` (JSON-schema output, overrides in Decision 3). Verify: pytest that the caller prompt carries the original lines and the goal, and judge override cases (turn limit, emergency hang-up) with a fake client.

## 2. Replay API

- [x] 2.1 Load `backend/.env` in `api/app.py`. Verify: pytest that `OPENAI_API_KEY` from a temp `.env` is visible to the replay module.
- [x] 2.2 `POST /api/agents/{id}/replay` (design Decision 4): SSE `started`, `result`, `error`, `done`; 4 jobs in parallel; unknown run ids rejected (`400`); no key → one setup `error`; a failure on one job → an `error` for that job only; disconnect cancels. Verify: pytest with an injected fake replay function for the event order, the setup error, a per-job error and an unknown id.
- [x] 2.3 Document the replay package and endpoint in `backend/copilot/README.md` (or a new `backend/replay/README.md`), and the key requirement in `README.md`. Verify: the README lists the endpoint, its events and the key.

## 3. Selection, scoring and the store

- [x] 3.1 `frontend/src/replay/client.ts` (SSE parser, reusing the copilot client's), and the pure functions `selectRuns` and `scoreReplay` (design Decision 5). Verify: Vitest for selection with and without findings (flagged and abandoned/stuck count as needing attention), the 3-run cap, and every scoring class, including not reproduced and broken.
- [x] 3.2 `copilotStore`: `replay` on the assistant message, persisted; start automatically on `done` when the turn has findings and a proposal; `replayCalls(agentId, index)` for the button; retry per run. Verify: Vitest that auto-start happens only with findings, that a reload keeps the results and marks running ones for retry, and that Apply during a replay leaves it running.

## 4. Replay card and canvas

- [ ] 4.1 `ReplayCard` under `ProposalCard`: summary line, one row per run (original outcome, before → after, reason, status), per-row Retry, setup message, *Replay calls* button when there are no results, label "Simulated text calls". Verify: Vitest for the summary text, row states and the button.
- [ ] 4.2 Opening a row shows the *after* transcript and draws its path on the proposal on the canvas (overlay on the review state); closing removes it. Verify: Vitest that the right node and edge classes are set on the proposal's graph and are cleared on close.
- [ ] 4.3 Extend the Playwright smoke spec: stub `/api/copilot` with findings and a proposal and `/replay` with canned results, then check that the card shows "Fixed" and opening a row highlights the path. Verify: `npm run e2e`.

- [ ] 4.4 *Replay this call* in the run detail: replays against the working copy, shows the outcome, goal, reason and transcript, and draws the path; disabled with a reason while a copilot draft is on the canvas. Verify: Vitest with a fake replay client for the result view, the overlay and the disabled state.

## 5. Demo readiness and real-model check

- [ ] 5.0 `backend/replay/check.py` and `make demo-check` (design Decision 8). Verify: pytest with a fake replay function for the printed table and the missing-key exit code; then run `make demo && make demo-check` with a real key and confirm the scheduler's cancel and four-question runs show the goal not met.
- [ ] 5.1 Run *Analyze runs* plus replay on the three demo agents with a real `OPENAI_API_KEY`, and record in `docs/production-runs-demo.md` per run: before, after, reason, and whether every failing run reproduced on *before*. Verify: the table is filled in, and for the scheduler at least the cancel and four-question runs reproduce on *before* and are fixed on *after*.
- [ ] 5.2 Click through both demo paths in the proposal's Demo section in the browser (full *Analyze runs* path, and the short manual-edit path) and time them. Verify: both work as written; record the timings in `docs/production-runs-demo.md`.
