# Proposal

## Why

The Copilot proposes a fix from production runs, but nothing shows that the fix works: the reviewer has a diff and the Copilot's word. In production iteration that is the expensive part. The deployment team has to call the agent again and try to reproduce each complaint by hand, and has no cheap way to check that the calls which used to work still do. Replaying the real calls against the proposal closes the loop the Copilot opened (**detect → explain → fix → verify**), and turns "trust the diff" into evidence the reviewer can see before pressing Apply.

## What Changes

- **Text replay of a run.** A simulated caller, seeded with the original caller's goal and the facts they gave (name, date of birth, medication), talks to an agent version in text. The agent side follows the same rules as the voice runtime: the node's persona and task messages, its edges as tools, `tts_say` and `end_conversation` actions, and end nodes. The replay records the transcript, the path, the outcome and whether the caller's goal was met, with a one-sentence reason.
- **Before and after.** Each replayed run is played against the working copy the proposal was made from (*before*) and against the proposal (*after*). If *before* reproduces the failure, the simulator is credible, and the difference comes from the fix.
- **Automatic after a runs review.** When a turn returns findings and a proposal, the runs the findings cite are replayed, plus up to three runs that worked, as a regression check. Any other proposal on an agent with runs offers a *Replay calls* button.
- **Replay card.** It sits under the proposal: "Fixed 4 of 5 failing calls · 3 of 3 working calls still work", with one row per run showing the before and after outcomes and the reason. Opening a row shows the replayed transcript and draws its path on the proposal on the canvas.
- **Replay one call by hand.** An open run in the Runs tab offers *Replay this call*. It plays that run against the current working copy, saved or not, so a manual edit can be checked with no Copilot turn.
- Replay needs `OPENAI_API_KEY` (the key the challenge provides, which the test call already uses). Without it the card says so, and the rest of the review works as before.

## Demo

**Click path:**
1. `make demo`, `make dev`, open *Riverside Clinic Scheduler*, Runs tab, **Analyze runs**.
2. Findings and the proposal arrive, and the replay card fills in by itself.
3. Point at the summary ("Fixed 5 of 6 failing calls · 3 of 3 working calls still work").
4. Open the r-1004 row: the cancel call now reaches the staff handoff, drawn on the proposal.
5. **Apply.**

**Short version (no Copilot wait):** open r-1004, *Replay this call* (fails), add an edge by hand, *Replay this call* again (passes).

**Placeholders, for the demo only:**
- Each demo run gets a hand-written `goal` ("Cancel the Friday appointment"). In production the goal would be extracted from the call, but a fixed goal keeps the simulated caller steady from one demo to the next.
- `make demo-check` replays every demo run against the seeded agents and prints the table, to warm up and to check the key before going on stage.

## Capabilities

### New Capabilities
- `run-replay`: simulated text replays of production runs against an agent version, the before/after comparison, and how the results are shown with a proposal.

### Modified Capabilities
<!-- None: the proposal flow, findings and Apply are unchanged; replay adds a card next to them. -->

## Impact

- Backend: new `backend/replay/` package (simulator, caller, judge), `POST /api/agents/{id}/replay` streaming SSE per run, and the API process now loads `backend/.env` (it does not today). It uses the `openai` package already installed with `pipecat-ai[openai]`.
- Frontend: a replay client (SSE), replay results stored on the assistant message (persisted with the chat like findings), `ReplayCard` under `ProposalCard`, *Replay this call* in the run detail, and the canvas path highlight reused for a replayed call.
- Cost: about 8 runs × 2 versions × ~8 turns × 2 LLM calls per review, on `gpt-4o-mini` for the caller and the judge, and the agent's own configured model for the agent side.
- Data: an optional `goal` on each run in `backend/demo/runs/*.json`; `make demo-check` target.
- No dependency on the other changes. A run "needs attention" when it is flagged or ended `abandoned` or `stuck`. A run "worked" when it ended `completed` or `transferred` without a flag.
