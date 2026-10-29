# Spec Delta

## ADDED Requirements

### Requirement: Analyze an agent's production runs
The Runs tab SHALL offer "Analyze runs", which opens the Copilot tab and sends a turn asking the copilot to review the open agent's runs and improve it. The turn SHALL start from the editor's working copy like any other turn. "Analyze runs" SHALL be unavailable while a copilot turn is running for that agent or when the agent has no runs.

#### Scenario: Analyze in one click
- **WHEN** the user clicks "Analyze runs" on a demo agent
- **THEN** the Copilot tab opens with the request shown as the user's message and the copilot starts working without further input

#### Scenario: Turn already running
- **WHEN** a copilot turn is running for the open agent
- **THEN** "Analyze runs" is disabled and says the copilot is busy

### Requirement: Findings tie problems to runs
When the copilot reviews runs, its reply SHALL include findings before any proposal. Each finding SHALL state the problem as callers experienced it, the ids of the runs that show it, the cause in the agent's graph (a node or edge, or a missing one), and the intended fix. Findings SHALL be grouped by cause, not listed per run.

#### Scenario: Findings card
- **WHEN** the copilot finishes reviewing the scheduler's runs
- **THEN** the reply shows a findings card with one finding per cause, such as "Callers cannot cancel" citing the runs that ask to cancel and naming the missing path from the greeting

#### Scenario: Open a cited run
- **WHEN** the user clicks a run id in a finding
- **THEN** the Runs tab opens with that run selected and its path highlighted on the canvas

### Requirement: Improvements fix what the runs show
After its findings, the copilot SHALL propose an improved agent through the normal proposal flow, changing the parts of the graph its findings name and leaving paths that work in successful runs as they are. When no run shows a problem, it SHALL say so and propose no change.

#### Scenario: Scheduler improved
- **WHEN** the copilot reviews runs where callers ask to cancel or reschedule and abandon the call, and runs where callers are asked for several details at once
- **THEN** the proposal adds cancel and reschedule paths, splits the intake into one question per node, keeps the booking path that completed calls used, and passes validation

#### Scenario: Healthy agent
- **WHEN** the copilot reviews an agent whose runs all completed or were correctly transferred, apart from one flagged run
- **THEN** the findings cover only that flagged run and the proposal changes only the part it names

### Requirement: Complete an unfinished agent from caller intent
When the runs show that the agent cannot finish what callers ask for (calls stuck at a node with no way forward, or requests with no path), the copilot SHALL build the missing flow from what callers asked for in the runs and the healthcare voice conventions, without inventing clinic policies the runs and the agent do not state. Where a policy is needed and unknown, it SHALL take the safe default of handing off to a human and say so.

#### Scenario: Refill line that stalls
- **WHEN** the copilot reviews the refill agent whose calls all end stuck after the medication is named
- **THEN** the proposal adds the steps callers needed to finish (confirming the pharmacy, a confirmation and goodbye), a human handoff for anything the agent cannot decide, the emergency exit and an end node, and the reply names the runs that motivated each part

### Requirement: Ask the copilot about one run
Each run in the Runs tab SHALL offer "Ask Copilot", which opens the Copilot tab with the run's transcript, its node path, its outcome and flag, and `What went wrong: ` prefilled in the input. Nothing SHALL be sent until the user sends it.

#### Scenario: Ask about a flagged run
- **WHEN** the user clicks "Ask Copilot" on a flagged run
- **THEN** the Copilot tab opens with that run's transcript, path, outcome and flag in the input, the cursor at the end, and no turn started

## MODIFIED Requirements

### Requirement: Copilot can only change the agent
The copilot SHALL only read and change the draft of the open agent, and MAY read the open agent's production runs. It SHALL NOT change the runs, run commands, read or write other files (including other agents' runs), or save, create or delete agents.

#### Scenario: Out-of-scope request
- **WHEN** the user asks the copilot to delete another agent or run a shell command
- **THEN** the copilot declines in one sentence and nothing outside the open agent's proposal changes

#### Scenario: Another agent's runs
- **WHEN** the user asks the copilot to look at the runs of a different agent
- **THEN** the copilot declines in one sentence and reads no other agent's runs
