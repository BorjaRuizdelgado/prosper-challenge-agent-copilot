# agent-configuration Specification

## Purpose

Covers the agent-level settings and the feedback loop that tells a user whether an agent is correct before they call it, plus a raw JSON escape hatch that doubles as the contract a Copilot will read and write.

## Requirements

### Requirement: Agent settings
The editor SHALL let the user edit the agent's name, global persona, voice and model. Voice SHALL be chosen from a curated list with a custom-id option, and model from a curated list with a custom option.

#### Scenario: Change voice
- **WHEN** the user selects a different voice and saves
- **THEN** the stored agent's `voice_id` is updated and the next test call uses it

### Requirement: Live validation
The editor SHALL validate the agent using the backend's rules after edits settle and SHALL show issues in a panel and on the affected nodes and edges, distinguishing blocking errors from warnings.

#### Scenario: Unreachable node
- **WHEN** a node cannot be reached from the initial node
- **THEN** a warning names the node and the node card shows a warning marker

#### Scenario: Dangling target
- **WHEN** an edge targets a node that does not exist
- **THEN** an error is shown on that edge and the call button is disabled with the reason

#### Scenario: No terminal node
- **WHEN** no node ends the call
- **THEN** a warning states that the call can only end by hang-up

#### Scenario: Valid agent
- **WHEN** there are no issues
- **THEN** the panel shows a clear "No issues" state

### Requirement: Raw JSON view
The editor SHALL provide a JSON view of the current agent that can be edited and applied; invalid JSON SHALL NOT replace the working graph.

#### Scenario: Apply valid JSON
- **WHEN** the user edits the JSON to add a node and applies it
- **THEN** the graph shows the new node and the agent is marked unsaved

#### Scenario: Malformed JSON
- **WHEN** the user applies JSON that cannot be parsed
- **THEN** the error and its location are shown and the graph is unchanged
