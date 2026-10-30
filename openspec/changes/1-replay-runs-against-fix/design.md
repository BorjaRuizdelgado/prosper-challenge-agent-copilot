# Design

## Context

The voice runtime compiles an agent with `AgentBuilder._make_node`:
- `role_message` is the node's `role_message` or the agent's `persona`;
- `task_messages` as written;
- one function per edge (name, description, properties, required) whose handler moves to `target`;
- `pre_actions` / `post_actions`, and an implicit `end_conversation` on `end` nodes.

The LLM is OpenAI (`config.model`, `gpt-4o` in the demo agents). A runs review ends with a `findings` event (run ids) and a `proposal` event (`agent` plus the `base` working copy, kept on the assistant message in `copilotStore`). The API process does not load `backend/.env` today; only `bot.py` does. Runs are in `runsStore`, and an open run is drawn on the canvas with `runPath`. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- A replay that behaves like the runtime closely enough that a failure in the original call reproduces on *before*.
- Results that arrive run by run within about a minute for a review, with no click needed after *Analyze runs*.
- A simulator that is a small, testable Python module.

**Non-Goals:**
- Voice: STT errors, barge-in, latency and TTS are not simulated. Replays test the graph and the prompts, which is what the Copilot changes.
- The Copilot calling replay itself and iterating until the calls pass. It is the natural next step on this engine, but it would multiply turn latency; the human sees the result instead.
- Statistical confidence (several samples per run), and replaying test calls.

## Decisions

### 1. A text simulator on the OpenAI API, not the Pipecat pipeline
`backend/replay/simulator.py` drives one conversation with plain chat completions with tools.

Alternative: run `FlowManager` with a text transport. It is closer to the runtime but needs a pipeline, frames and a transport per replay. It is heavy to run 16 at once and hard to unit test.

Mitigation for drift: the simulator builds each node from `AgentConfig` (`schema.py`), the same input as `AgentBuilder`. A pytest compares, for every demo agent and blueprint, the simulator's per-node system text and tool definitions with `AgentBuilder._make_node`'s `role_message`, `task_messages` and function schemas.

Conversation rules, mirroring Pipecat Flows' default (append) context strategy:
- The agent speaks first at `initial_node`.
- On a node: run its `pre_actions` (`tts_say` adds an agent line verbatim), set the system text to its role message, append its task messages as developer messages, and expose only its edges as tools.
- An edge call returns `{"status": "success", **args}`, records `{node: target, via: function, args}` and enters the target, which then speaks.
- After the agent speaks on a node, its `post_actions` run. An `end_conversation` action, or the implicit one on an `end` node, ends the call.
- After 12 agent turns without an end, the replay stops with outcome `stuck`.

The agent side uses the agent's `model` with default temperature, as the runtime does.

### 2. The simulated caller is seeded from the original call
`replay/caller.py`, on `gpt-4o-mini`, temperature 0.4. Its system prompt:
- "You are calling the clinic. What you wanted: <goal>. What you said in the original call, in order: <caller lines>."
- Answer briefly, as on the phone; reuse those facts when asked and invent nothing that matters.
- Push for your goal as the original caller did.
- If told to hang up and call emergency services, or that you are being transferred, say goodbye and output `[HANGUP]`. Also output `[HANGUP]` when you would give up.

The goal is one sentence: the run's `goal` field when present (all demo runs have one; see Decision 8), otherwise the judge's one-line summary of the original call (one extra call, cached per run in `workspace/replay/goals.json`).

Alternative: replay the original caller lines verbatim. That breaks as soon as the agent asks in a different order, which is exactly what a fix does.

### 3. The outcome comes from a judge, with hard overrides
`replay/judge.py`, on `gpt-4o-mini` with JSON-schema output `{outcome, goal_met, reason}`. Its input is the original transcript (for the goal), the replay transcript, and how the call ended: an end node, `[HANGUP]` or the turn limit. Overrides:
- the turn limit means `stuck`;
- an emergency instruction followed by a hang-up means `transferred` with the goal met (safety handled).

The judge defines the outcomes as the runs do.

### 4. API: `POST /api/agents/{id}/replay` streams SSE
The body is `{base, proposal, run_ids}`. Up to 4 (run, version) jobs run in parallel. Events:
- `started {run_id, version}`;
- `result {run_id, version, transcript, path, outcome, goal_met, reason}`;
- `error {run_id?, version?, message, setup}`;
- `done`.

Run ids are checked against `list_runs`. A missing `OPENAI_API_KEY` returns one `error` with `setup: true` and no jobs. A client disconnect cancels the jobs (the copilot endpoint's pattern). `api/app.py` loads `backend/.env` with `python-dotenv`, as `bot.py` already does.

### 5. Which runs, and the scoring, live in the frontend as pure functions
`replay/selectRuns(findings, runs)` picks the cited runs, then up to 3 that worked (outcome `completed` or `transferred`, no flag), newest first. For *Replay calls* with no findings, it picks the runs that need attention (flagged, or `abandoned` / `stuck`).

`replay/scoreReplay(runs, results)` counts:
- **fixed**: the original call failed and *after* meets the goal;
- **kept**: the original call worked and *after* still meets the goal;
- **broken**: the original call worked and *after* does not;
- **not reproduced**: *before* meets the goal of a run that failed.

Both functions are Vitest-tested. The backend only replays.

### 6. Results live on the assistant message
`ChatMessage.replay = {status, runs: {[id]: {before?, after?, error?}}}` is persisted with the chat like `findings`. A reload shows finished results; replays cut off by the reload show *Retry*. The copilot store starts the replay when a turn's `done` arrives with both findings and a proposal.

### 7. Canvas
Opening a replay row puts the proposal on the canvas through the existing review state and overlays the replay's path with the run-highlight classes. The overlay is computed with `runPath` against the proposal, and closing the row removes it.

*Replay this call* reuses the endpoint with `base` = the working copy and no `proposal`. Only the *before* job runs, and its result is drawn with the same overlay on the working copy.

### 8. Demo placeholders
- **`goal` on every demo run.** An optional run field, one sentence in the caller's terms ("Cancel the Friday appointment", "Get a refill of lisinopril sent to the pharmacy"). It is hand-written and stands in for goal extraction, so the simulated caller does not change from one demo to the next. `test_demo_runs.py` checks that every demo run has one.
- **`make demo-check`** (`python -m replay.check`): replays every demo run against its seeded agent, *before* only, 4 at a time, and prints `run · original outcome · replay outcome · goal met · reason`. It exits non-zero without a key. It runs before the demo to warm up and to confirm the seeded agents still reproduce their failures.
- Nothing is pre-recorded. Every replay shown in the demo is real, and the card says "Simulated text calls".

## Risks / Trade-offs

- [The simulator says "fixed" when the real voice call would still fail] → The *before* replay must reproduce the failure, otherwise the run is "not reproduced". The card says "simulated text calls". Voice-specific failures stay a non-goal and are named in solution.md.
- [Run-to-run variance] → A fixed caller temperature and the judge's reason on each row make outliers readable. Retry per row. A second sample per run is a cheap follow-up if it proves noisy.
- [Simulator drifts from `AgentBuilder`] → The parity pytest in Decision 1.
- [Cost and rate limits during the demo] → `gpt-4o-mini` for the caller and the judge, 4 jobs at a time, at most 9 runs, and a cancel on disconnect.
- [Judge leniency] → The overrides in Decision 3, plus a pytest with scripted transcripts for each outcome (fake OpenAI client).
