# run-replay Specification

## Purpose

Shows whether a change to an agent fixes the production calls that failed and keeps the ones that worked, by replaying those calls with a simulated caller against the agent before and after the change.

## Requirements

### Requirement: Replay a run against an agent version
The system SHALL replay a production run against a given agent version, as text, with a simulated caller who pursues the original caller's goal (the run's stated goal when it has one) and gives the same facts the original caller gave. A replay SHALL produce a transcript, the path through the nodes with the edge taken and data collected, an outcome (`completed`, `transferred`, `abandoned` or `stuck`), whether the caller's goal was met, and one sentence on why.

#### Scenario: Replay a failed cancel call
- **WHEN** the scheduler run where the caller wanted to cancel is replayed against the scheduler as seeded
- **THEN** the replay's caller asks to cancel, the agent cannot do it, and the replay ends `abandoned` or `stuck` with the goal not met

#### Scenario: Caller keeps their facts
- **WHEN** a refill run is replayed and the agent asks for the caller's name and date of birth
- **THEN** the simulated caller gives the name and date of birth from the original run

### Requirement: Replays follow the agent's runtime rules
The agent side of a replay SHALL behave as the voice runtime would: it speaks with the node's persona or role override and task messages, it moves only through the current node's edges, it collects the edge's parameters, it speaks `tts_say` text word for word, and it ends the call on an end node or an `end_conversation` action. A replay that has not ended after a fixed number of turns SHALL end `stuck`.

#### Scenario: Dead end
- **WHEN** a refill run is replayed against the seeded refill agent, whose last node has no edges and does not end
- **THEN** the replay stays at that node until the turn limit and ends `stuck`

#### Scenario: Path recorded
- **WHEN** a replay moves from one node to another through an edge with parameters
- **THEN** the replay's path lists the target node, the edge's function and the collected values

### Requirement: Before and after comparison
Each replayed run SHALL be played against the agent version a proposal was made from and against the proposal. A run SHALL count as fixed when it failed in the original call and the *after* replay meets the caller's goal, and as kept when it worked in the original call and the *after* replay still meets the goal. A failed run whose *before* replay meets the goal SHALL be marked as not reproduced.

#### Scenario: Fixed call
- **WHEN** the cancel run is replayed against a proposal that adds a cancel or staff-handoff path from the greeting
- **THEN** *before* is not met and *after* is met with outcome `completed` or `transferred`, and the run counts as fixed

#### Scenario: Regression
- **WHEN** a completed booking run is replayed against a proposal that breaks the booking path
- **THEN** the run is shown as no longer working

#### Scenario: Not reproduced
- **WHEN** the *before* replay of a failed run meets the caller's goal
- **THEN** the run is marked as not reproduced and is not counted as fixed or failed

### Requirement: Replay runs after a runs review
When a copilot turn ends with findings and a proposal, the system SHALL replay, without a user action, every run the findings cite and up to three runs that worked. For any other proposal on an agent that has runs, the proposal SHALL offer "Replay calls", which replays the runs that need attention and up to three that worked. A run needs attention when it is flagged or ended `abandoned` or `stuck`, and worked when it ended `completed` or `transferred` without a flag.

#### Scenario: Automatic replay
- **WHEN** the copilot finishes *Analyze runs* on the scheduler with findings and a proposal
- **THEN** a replay card appears under the proposal and fills in run by run, without the user clicking anything

#### Scenario: On request
- **WHEN** the user asks for an ordinary edit on a demo agent and gets a proposal
- **THEN** the proposal offers "Replay calls", and nothing is replayed until it is clicked

### Requirement: Replay results with the proposal
The replay card SHALL show a summary (fixed out of failing, kept out of working, not reproduced) and one row per run with its original outcome, the *before* and *after* outcomes, and the reason. Opening a row SHALL show the *after* transcript and draw its path on the proposal on the canvas. Results SHALL stay with the proposal after a page reload. Replay SHALL NOT block Apply or Discard.

#### Scenario: Summary
- **WHEN** replay finishes on the scheduler review
- **THEN** the card reads like "Fixed 5 of 6 failing calls · 3 of 3 working calls still work" and lists each run

#### Scenario: Open a replayed call
- **WHEN** the user opens a row of the replay card
- **THEN** the *after* transcript is shown, and the canvas shows the proposal with the replay's visited nodes and edges highlighted

#### Scenario: Apply during replay
- **WHEN** the user clicks Apply while replays are still running
- **THEN** the proposal is applied as usual and the replays still finish and are shown

### Requirement: Replay one call against the working copy
An open run in the Runs tab SHALL offer "Replay this call", which replays that run once against the editor's working copy, saved or not, and shows the outcome, whether the goal was met, the reason and the transcript, and draws the replay's path on the canvas. It SHALL be unavailable while a copilot draft is shown on the canvas.

#### Scenario: Manual fix checked
- **WHEN** the user replays the scheduler's cancel run, adds a staff-handoff edge from the greeting by hand, and replays it again
- **THEN** the first replay is not met and the second is met with outcome `transferred`, without saving and without a copilot turn

#### Scenario: Copilot draft on the canvas
- **WHEN** a copilot draft is shown on the canvas
- **THEN** "Replay this call" is disabled and says to apply or discard the draft first

### Requirement: Demo readiness check
A single command SHALL replay every demo run against its seeded demo agent and print one line per run with its outcome and whether the goal was met, and SHALL fail with a clear message when the OpenAI key is missing.

#### Scenario: Before the demo
- **WHEN** the presenter runs the check after seeding the demo
- **THEN** it prints a line per demo run, and the scheduler's cancel and four-question runs show the goal not met

#### Scenario: No key
- **WHEN** the check runs without `OPENAI_API_KEY`
- **THEN** it stops at once and says the key is missing

### Requirement: Replay changes nothing
Replay SHALL NOT change the agent, its draft, its working copy or its runs, and replayed calls SHALL NOT be added to the agent's runs.

#### Scenario: Runs unchanged
- **WHEN** replays finish
- **THEN** the agent's runs list and the saved agent are unchanged

### Requirement: Replay unavailable
When replay cannot run (no OpenAI key, or the provider fails), the replay card SHALL say why with Retry, and the findings, proposal, Apply and Discard SHALL keep working. A replay that fails on one run SHALL be shown as failed for that run only.

#### Scenario: No key
- **WHEN** `OPENAI_API_KEY` is not set and a runs review returns a proposal
- **THEN** the replay card says replay needs the OpenAI key, and Apply works

#### Scenario: One run fails
- **WHEN** the provider fails on one run's replay
- **THEN** that row shows an error with Retry and the other rows show their results
