# Tasks

Each group is a vertical slice that ends with something usable and verified. Backend tests never call Claude (fake SDK client or fake runner); real model behavior is checked with the demo script in group 5.

## 1. Guidelines stored with the agent

- [x] 1.1 `store`: `get_guidelines`, `save_guidelines` (atomic), copy on duplicate, delete on delete; `create_agent(name, guidelines=None)`. Verify: pytest for create with and without guidelines, duplicate copies, delete removes, and the agent list still shows only agents.
- [x] 1.2 API: `POST /api/agents` with optional `guidelines` (≤ 50 KB, else `422`), `GET`/`PUT /api/agents/{id}/guidelines` (`404` when none), `GET /api/demo/guidelines`. Verify: pytest for each, including invalid id `400` and oversize `422`.
- [ ] 1.3 Write `backend/demo/guidelines/maple-family-practice.md` with the content and planted gaps in design Decision 7. Verify: pytest that `GET /api/demo/guidelines` returns it, and a manual read that every gap in Decision 7 is present.

- [ ] 1.4 Demo placeholders (design Decision 8): write `maple-family-practice.reply.md` and `demo-riverside-scheduler.guidelines.md`; `GET /api/demo/guidelines` returns `reply`; `demo/seed.py` stores the scheduler's guidelines. Verify: pytest that seeding stores them and re-seeding resets an edited copy, and that the sample endpoint includes `reply`.

## 2. Copilot reads the guidelines and reports coverage

- [ ] 2.1 Workspace `guidelines_path(agent_id)` (git-ignored); `run_turn` writes the file or removes a stale one and adds the prompt line only when it exists. Guard: Read only on the agent's own guidelines. Verify: extend the runner and guard pytests (own file read ok, edit denied, another agent's file denied, `..` and symlink variants).
- [ ] 2.2 `report_coverage` tool with the checks in design Decision 4; the runner emits a `coverage` event (last wins) and the step "Reporting coverage (N/M)". Verify: pytest for valid input, unknown node, duplicate id, a `default` without a question, and the scripted fake client event order step → coverage → proposal → done.
- [ ] 2.3 Skill and prompt changes in design Decision 5. Verify: the skill and prompt pytests check each new rule (read the guidelines, defaults not questions on build, `report_coverage` after validation, the check-coverage and client-answer flows, the clarify rule limited to edits).
- [ ] 2.4 Document the guidelines file, `report_coverage` and the `coverage` event in `backend/copilot/README.md`. Verify: the README's event list matches the runner's.

## 3. New from guidelines

- [ ] 3.1 `api.ts` (`createAgent(name, guidelines?)`, `getGuidelines`, `saveGuidelines`, `listSampleGuidelines`) and the model types. Verify: `npm run typecheck`.
- [ ] 3.2 *New from guidelines* dialog in `AgentList` (page and menu variants, empty state included): name, textarea, file drop or input for `.md`/`.txt` with rejection of other types, *Use sample guidelines*. On confirm: create, navigate, open the Copilot, send the build message; the chat shows the guidelines chip. Verify: Vitest for the file accept/reject, the sample fill, and that `send` is called once with the fixed message after navigation.
- [ ] 3.3 *Client guidelines* section in `SettingsForm` (view, Edit/Save/Cancel, Add, *Check coverage*). Verify: Vitest that saving calls `saveGuidelines` and leaves the agent store's dirty flag unchanged, and that *Check coverage* opens the Copilot and sends the fixed message once.

## 4. Coverage card

- [ ] 4.1 Copilot client and store: parse `coverage`, attach and persist it on the assistant message. Verify: Vitest for parsing and a reload restoring it.
- [ ] 4.2 `CoverageCard` above the proposal: count line, rows by status with node chips (hover focus, click select), questions with defaults, *Copy as email* (clipboard plus toast), *Re-check coverage* (sends the fixed message), *Use sample client reply* when the guidelines are a sample (prefills, does not send). Verify: Vitest for the count, grouping, the copied text format, the re-check send, and the sample-reply button shown only for a sample.
- [ ] 4.3 Update `README.md` (Copilot section) and extend the Playwright smoke spec: stub `/api/copilot` with a skeleton draft, a coverage event and a proposal; create from the sample; see the coverage card and questions. Verify: `npm run e2e`.

## 5. Real-model check

- [ ] 5.1 Run *New from guidelines* with the sample on Haiku and Sonnet, then answer one question in chat. Record in a new `docs/guidelines-demo.md`: requirement count, which planted gaps became questions, 0 validation issues, and the answer turn removing that question. Verify: the doc is filled in and at least 4 of the 5 planted gaps became questions on the model chosen for the demo.
- [ ] 5.2 Click through both demo paths in the proposal's Demo section in the browser (full build with the sample reply, and *Check coverage* on the seeded scheduler) and time them. Verify: both work as written; the scheduler's card shows cancel, reschedule and staff as *open*; record the timings in `docs/guidelines-demo.md`.
