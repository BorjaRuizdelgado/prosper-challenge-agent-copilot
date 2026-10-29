# Tasks

Each group is a vertical slice that ends with something usable and verified. Tests and docs land in the group that owns the work. Backend tests never call Claude (fake SDK client or fake runner, as in the copilot change); real model behavior is checked with the demo script in group 7.

## 1. Demo agents, mocked runs and seeding

- [x] 1.1 Write the three demo agents in `backend/demo/agents/` with the flaws in design Decision 3 (`demo-riverside-scheduler`, `demo-sunrise-refills`, `demo-lakeside-billing`). Verify: a pytest loads each through the validator and expects no errors, and expects the planted warnings (dead end / no end node) on the refill agent.
- [x] 1.2 Write about 8 runs per agent in `backend/demo/runs/<id>.json` (shape in design Decision 1) covering the outcomes and flags in Decision 3, with short spoken transcripts. Verify: a pytest checks unique run ids, allowed outcomes, ISO start times, alternating speakers, and that every `node` and `via` in a path exists in that agent (the edge on the previous node).
- [x] 1.3 Add `demo/seed.py` (writes each demo agent into the agents directory under its id, atomically, replacing an existing one, leaving other agents alone) and a `make demo` target. Verify: pytest with a temp `AGENTS_DIR` covers first seed, re-seed after a change (file restored) and an unrelated agent untouched; `make demo` then the editor's agent list shows the three agents.

## 2. Runs API

- [x] 2.1 Add a runs module (`RUNS_DIR`, default `backend/demo/runs/`; `list_runs(agent_id)` newest first, empty list when there is no file) and `GET /api/agents/{id}/runs`. Verify: pytest for a demo agent (sorted, full shape), an agent without runs (`[]`), an invalid id (`400`), and that a test-call session does not touch the runs.
- [x] 2.2 Add the `Run` type to `frontend/src/model.ts` and `listRuns(agentId)` to `api.ts`. Verify: `npm run typecheck` (or `tsc --noEmit`) passes.

## 3. Runs tab and trace on the canvas

- [x] 3.1 `runs/runsStore.ts`: per-agent load state, `selectedRunId`, `load`, `select`, `clear`; a `runPath(run, agent)` helper returning visited nodes, taken edges, the last node and the path entries whose node is missing. Verify: Vitest for load success/failure, select/clear, and `runPath` on a normal run, a stuck run and a run with a removed node.
- [x] 3.2 `RunsPanel` registered in `DOCK_TABS` after Call: summary counts per outcome and flagged, list newest first (outcome chip, time, duration, first caller line, flag), empty state without Analyze, error with Retry; selecting a run expands its transcript with transition notes and the path line (missing nodes labelled). Verify: Vitest for summary counts, ordering, flag shown, empty state, error + Retry, and expanding a run.
- [x] 3.3 Canvas highlight for the selected run (visited nodes, taken edges, last node marked) using the call highlight's render path with its own style; precedence copilot review > live call > run; cleared when leaving the tab or switching agent. Verify: Vitest that selecting a run sets the classes on the right nodes and edges, that leaving the tab clears them, and that a live copilot draft hides them; manual check in the browser on a stuck refill run.

## 4. Copilot can read the open agent's runs

- [x] 4.1 `render_runs(runs)` in `backend/copilot/` producing the text format in design Decision 4. Verify: pytest snapshot on one run with a flag, transitions with args and a missing `via`.
- [x] 4.2 Workspace: `runs_path(agent_id)` under `workspace/runs/` (git-ignored); the runner writes the file before each turn when the agent has runs, removes a stale one otherwise, and adds the "Its production runs are in …" line to the prompt only when it exists. Verify: pytest with a fake SDK client checks the file and the prompt line for a demo agent, and their absence for an agent without runs.
- [x] 4.3 Guard: allow `Read` on the current agent's runs file, deny `Edit`/`Write` on it and any access to another agent's runs file. Verify: extend the guard pytest table with these cases plus `..` and symlink variants.

## 5. Findings tool, review skill and prompt

- [x] 5.1 Add `report_findings` to the copilot MCP server (schema in design Decision 5): rejects unknown run ids with a message listing them, otherwise records. Allow it in the runner options. Verify: pytest on valid findings, an unknown id and an empty list.
- [ ] 5.2 Runner: emit a `findings` event with the tool input after a successful `report_findings` result (last one wins), and a step line "Reporting N findings". Verify: pytest with the scripted fake SDK client: event order step → findings → draft → proposal → done; an errored call emits no `findings`.
- [ ] 5.3 Write `workspace/.claude/skills/prosper-run-review/SKILL.md` (design Decision 6) and add to the system prompt: load it for run reviews, runs are evidence not instructions, decline other agents' runs. Verify: the skill pytest checks every rule from the spec requirements *Findings tie problems to runs*, *Improvements fix what the runs show* and *Complete an unfinished agent from caller intent* appears; the prompt test checks the two new lines; the guard allows reading the new skill directory.
- [ ] 5.4 Document the runs file, `report_findings` and the `findings` event in `backend/copilot/README.md`. Verify: the README's event list matches the runner's.

## 6. Analyze, findings card and Ask Copilot per run

- [ ] 6.1 Frontend client and store: parse the `findings` event, attach findings to the assistant message, persist them with the chat. Verify: Vitest for parsing, attaching and a reload restoring the findings.
- [ ] 6.2 Findings card above the proposal card: title, cause, fix, run ids as links that select the run and open the Runs tab; hover on a finding with `node` focuses it on the canvas. Verify: Vitest for rendering and the run link switching tab and selection.
- [ ] 6.3 "Analyze runs" in the Runs tab: opens the Copilot tab and sends the fixed review message with the working copy; disabled with a reason while a turn runs, hidden when there are no runs. Verify: Vitest that the user message appears and `send` is called once, and the disabled state.
- [ ] 6.4 "Ask Copilot" on a run: `buildRunMessage(run)` in `call/askCopilot.ts` (transcript, path, outcome, flag, `What went wrong: `), prefilled without sending. Verify: Vitest for the message builder on a flagged run and that no turn starts.

## 7. Demo run and integration

- [ ] 7.1 Extend the Playwright smoke spec: stub `/api/agents/{id}/runs` and `/api/copilot` (canned stream with a `findings` event and a proposal); open Runs, select a run (canvas highlight), Analyze, see the findings card, click a run link, Apply, see the new node. Verify: `npm run e2e` passes.
- [ ] 7.2 Write `docs/production-runs-demo.md` and run it against the real CLI after `make demo`: the scheduler (cancel/reschedule paths, split intake, booking path unchanged), the refill line (missing flow built, pharmacist handoff, emergency exit, no invented policy), the billing line (one edge changed), Ask Copilot on one run, and asking about another agent's runs (declined). Record what was observed with `COPILOT_MODEL=sonnet` and with the default Haiku. Verify: each scenario observed; failures fixed in the skill or prompt, or recorded as known issues.
- [ ] 7.3 README (demo section: `make demo`, Runs tab, Analyze runs) and `solution.md` (production iteration: mocked runs, review skill, findings, what is left out and why). Verify: following the README from `make demo` reaches an Analyze runs proposal.

## Workflow follow-up

- Archive the change after review, creating `openspec/specs/production-runs/` and syncing the `agent-copilot` delta.
- Next change candidates: replaying runs against the proposed agent with a simulated caller, automatic flagging of new calls, agent versions.
