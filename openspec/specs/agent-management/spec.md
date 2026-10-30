# agent-management Specification

## Purpose

Defines how voice agents are stored, listed and managed so that the builder UI, the voice runtime and the future Copilot all share one durable source of truth for agent definitions.

## Requirements

### Requirement: Agents are persisted as JSON documents
The system SHALL store each agent as one JSON document in the AgentConfig format, addressable by a stable, URL-safe id, and SHALL keep documents across restarts.

#### Scenario: First start seeds the example agent
- **WHEN** the agent store is empty on startup
- **THEN** the example scheduler agent is available in the list with a stable id

#### Scenario: Unsafe ids are rejected
- **WHEN** a request references an id containing path separators or characters outside lowercase letters, digits and hyphens
- **THEN** the system responds with a 4xx error and touches no file

### Requirement: Agent API supports full lifecycle
The system SHALL expose list, get, create, replace, duplicate and delete operations for agents over HTTP, returning each agent's id, name, node count and last-modified time in listings.

#### Scenario: Create from name
- **WHEN** a client creates an agent with a name and no body
- **THEN** a valid starter agent (one greeting node marked as initial) is stored and returned with its new id

#### Scenario: Saving is atomic
- **WHEN** a save fails midway
- **THEN** the previously stored version of the agent remains intact and readable

#### Scenario: Missing agent
- **WHEN** a client requests or deletes an unknown id
- **THEN** the system responds with 404

### Requirement: Saves are validated but drafts are allowed
The system SHALL accept saving an agent that has validation issues, SHALL return those issues with the saved agent, and SHALL refuse to start a call for an agent with blocking issues.

#### Scenario: Save with a dangling edge
- **WHEN** a client saves an agent whose edge targets a non-existent node
- **THEN** the save succeeds and the response lists an error issue naming the node and edge

### Requirement: Agents list UI
The UI SHALL list all agents on a home page and in a switcher opened from the open agent's name in the editor's top bar, let the user create, rename, duplicate and delete them (with delete confirmation), and open one into the editor via a shareable URL.

#### Scenario: Create and open
- **WHEN** the user clicks "New agent" and enters a name
- **THEN** the agent appears in the list and is opened in the editor at its own URL

#### Scenario: Empty and error states
- **WHEN** the list is empty or the API is unreachable
- **THEN** the UI shows an empty state with a create action, or an error with a retry action, instead of a blank screen
