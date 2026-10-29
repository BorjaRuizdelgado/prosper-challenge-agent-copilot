# agent-graph-editor Specification

## Purpose

Lets a user see an agent as a graph of conversation nodes and transitions and edit it visually, without hand-writing JSON.

## Requirements

### Requirement: Graph canvas renders the agent
The editor SHALL render each node as a card showing its name, a summary of its task, and its outgoing edges, with edges drawn as labelled connections to their target nodes, marking the initial node and terminal nodes distinctly.

#### Scenario: Open an agent without saved layout
- **WHEN** an agent with no `layout` is opened
- **THEN** nodes are laid out automatically left to right with no overlaps and the view fits the whole graph

#### Scenario: Open an agent with saved layout
- **WHEN** an agent with a `layout` is opened
- **THEN** nodes appear at their saved positions

### Requirement: Node editing
The editor SHALL let the user select a node and edit its name, task messages, optional role override, pre/post actions and terminal flag in a side panel.

#### Scenario: Rename a node
- **WHEN** the user renames a node
- **THEN** every edge targeting it and the agent's initial node reference update to the new name, and names remain unique

#### Scenario: Duplicate name rejected
- **WHEN** the user enters a name already used by another node
- **THEN** the change is refused with an inline message and the previous name is kept

### Requirement: Edge editing
The editor SHALL let the user create an edge by dragging between nodes, and edit its function name, description, target, and collected parameters (name, type, description, enum values, required).

#### Scenario: Connect nodes
- **WHEN** the user drags from a node's output handle to another node
- **THEN** a new edge with a unique function name is added and selected for editing

#### Scenario: Edit collected parameters
- **WHEN** the user adds a string parameter "full_name" marked required
- **THEN** the edge's `properties` and `required` contain it and no raw JSON editing is needed

#### Scenario: Retarget an edge
- **WHEN** the user changes an edge's target or drags its end to another node
- **THEN** the edge points to the new node

### Requirement: Structural edits
The editor SHALL let the user add nodes, delete nodes and edges, set the initial node, and re-run auto layout. Deleting a node SHALL also delete edges that target it after confirmation of the count.

#### Scenario: Delete a targeted node
- **WHEN** the user deletes a node that two edges target
- **THEN** the user is told two edges will be removed, and on confirming both are removed

#### Scenario: Initial node protected
- **WHEN** the user deletes the initial node while other nodes exist
- **THEN** the editor requires choosing a new initial node first

### Requirement: Explicit saving with dirty state
The editor SHALL track unsaved changes, show a save control and status, save positions along with the agent, and warn before navigating away from unsaved changes.

#### Scenario: Save and reload
- **WHEN** the user edits a node, moves it and saves, then reloads the page
- **THEN** the edit and the new position persist

#### Scenario: Save failure
- **WHEN** the save request fails
- **THEN** the editor stays dirty, keeps the user's edits and shows the error with retry
