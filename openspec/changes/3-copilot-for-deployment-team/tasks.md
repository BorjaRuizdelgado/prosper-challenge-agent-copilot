# Tasks

## 1. System prompt

- [ ] 1.1 Rewrite the opening and the reply rule in `backend/copilot/system_prompt.md`: the user is a Prosper deployment engineer configuring a clinic client's agent; the reply names changed nodes and edges, states defaults and assumptions, and ends with what to confirm with the client when a policy was unknown; keep one paragraph, no lists, JSON or paths. Rephrase "When to ask" so client decisions are framed as questions for the client. Verify: update `REQUIRED` in `test_copilot_system_prompt.py` (persona phrase, "deployment engineer", "name the nodes", "confirm with the client") and `uv run pytest tests/test_copilot_system_prompt.py` passes.
- [ ] 1.2 Check `prosper-run-review` and `prosper-blueprints` for reply wording that contradicts the new rule ("the usual three sentences", "do not add notes") and align it. Verify: the skill pytests pass, and grepping the skills for "left alone" shows no rule against stating assumptions.

## 2. Copilot panel copy

- [ ] 2.1 `CopilotPanel.tsx`: new empty-state lede and `EXAMPLES` (build from the client's guidelines, "Add a way to cancel an appointment", add a staff handoff after caller complaints, one question per node in the intake). Verify: update `CopilotPanel.test.tsx` so the examples render and a click fills the input without sending; `npm test` passes.

## 3. Real-model check

- [ ] 3.1 Through `run_turn` on Haiku and the demo model, send "Add a way to cancel an appointment" to `demo-riverside-scheduler` and "Add a staff handoff from every step" to `demo-sunrise-refills`. Verify: record both replies in `docs/production-runs-demo.md` (Known issues section or a new table): each names the changed nodes, the cancel reply names the assumed default and what to confirm with the client, and each stays one paragraph.
- [ ] 3.2 Click through the Demo section of the proposal in the browser (example chip on the scheduler). Verify: the reply shows the three parts (nodes named, assumption, confirm with the client) on the demo model, three runs in a row.
