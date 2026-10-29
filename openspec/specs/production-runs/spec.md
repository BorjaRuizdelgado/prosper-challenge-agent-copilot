# production-runs Specification

## Purpose

Gives each agent a history of (mocked) production calls, with transcripts, node paths and outcomes, so a user can see how the agent behaves with real callers and hand those calls to the copilot.

## Requirements

### Requirement: Runs are recorded per agent
The system SHALL provide, for each agent id, a list of production runs. Each run SHALL have an id, a start time, a duration, an outcome (`completed`, `transferred`, `abandoned` or `stuck`), the transcript as alternating caller and agent lines, and the path as the ordered nodes visited with the edge taken and the data collected at each step. A run MAY carry a flag: a short note from the client.

#### Scenario: Agent with runs
- **WHEN** the runs of a demo agent are requested
- **THEN** each run has an id, start time, duration, outcome, transcript and path, and flagged runs include the client's note

#### Scenario: Agent without runs
- **WHEN** the runs of an agent with no production history are requested
- **THEN** the result is an empty list, not an error

#### Scenario: Unknown or invalid id
- **WHEN** runs are requested for an invalid agent id
- **THEN** the request is rejected as invalid, as for other agent endpoints

### Requirement: Runs are mocked and read-only
Runs SHALL come from committed demo data. The system SHALL NOT record calls, and no user action SHALL add, change or delete a run.

#### Scenario: Test call is not a run
- **WHEN** the user places a test call on a demo agent
- **THEN** the agent's runs are unchanged

### Requirement: Demo agents are seeded on request
A single command SHALL write the demo agents into the agents store under fixed ids, replacing any agents with those ids, so the demo can be reset. The demo agents SHALL include at least a scheduler that lacks paths callers need, an unfinished agent whose flow cannot reach an end, and an agent whose runs are mostly successful.

#### Scenario: Seed the demo
- **WHEN** the user runs the demo seed command and opens the editor
- **THEN** the agent list shows the demo agents next to the user's own, and each demo agent has runs

#### Scenario: Reset after a demo
- **WHEN** the user has applied and saved a copilot proposal on a demo agent and runs the seed command again
- **THEN** that agent is back to its flawed version and its runs are unchanged

### Requirement: Runs tab summarizes an agent's runs
The editor SHALL offer a Runs tab in the dock for the open agent, showing the number of runs, the count per outcome, the number of flagged runs, and the list of runs newest first with outcome, time, duration, the caller's first line and the flag if any.

#### Scenario: Open the Runs tab
- **WHEN** the user opens a demo agent and selects the Runs tab
- **THEN** the tab shows the totals per outcome and the run list, with flagged runs marked

#### Scenario: No runs
- **WHEN** the user opens the Runs tab on an agent with no runs
- **THEN** the tab says the agent has no production runs and offers no analysis

#### Scenario: Runs fail to load
- **WHEN** the runs request fails
- **THEN** the tab shows an error with Retry and the rest of the editor keeps working

### Requirement: Inspect one run and its trace
Selecting a run SHALL show its transcript with the transitions between nodes and the data collected, and SHALL highlight the run's path on the canvas: the nodes it visited, the edges it took, and the node where it ended. Nodes in the path that no longer exist in the agent SHALL be listed as missing rather than drawn.

#### Scenario: Stuck run
- **WHEN** the user selects a run with outcome `stuck`
- **THEN** the transcript shows where the caller repeated themselves, and the canvas highlights the visited nodes with the last one marked as where the call ended

#### Scenario: Clear the highlight
- **WHEN** the user closes the run or leaves the Runs tab
- **THEN** the canvas no longer highlights the run's path

#### Scenario: Agent changed since the run
- **WHEN** a run's path includes a node that has since been renamed or removed
- **THEN** the run still shows its transcript and the missing node is named in the path, and the canvas highlights only nodes that exist
