# agent-copilot Specification

## Purpose

Lets a user create and change the open agent by describing what they want in plain language, and review, apply or discard each validated change the copilot proposes before it reaches the editor.

## Requirements

### Requirement: Copilot panel in the editor
The editor SHALL offer a Copilot tab in the dock for the open agent, with a message input, the conversation so far, and an empty state that suggests what to ask.

#### Scenario: Open the copilot
- **WHEN** the user opens an agent and selects the Copilot tab
- **THEN** the panel shows a message input and example requests, such as building an agent from guidelines or changing a step

### Requirement: Instructions produce a proposed change
The copilot SHALL turn a natural-language instruction into a proposed new version of the open agent and SHALL reply with a summary of what it changed in no more than three sentences.

#### Scenario: Build from guidelines
- **WHEN** the user pastes a clinic's call guidelines into a new agent and sends them
- **THEN** the copilot proposes an agent whose nodes and edges cover the steps in the guidelines, with a short summary of the flow

#### Scenario: Targeted edit
- **WHEN** the user asks to collect date of birth before the reason for visit
- **THEN** the proposal changes only the nodes and edges needed for that, and the rest of the agent is unchanged

### Requirement: Copilot works on the current working copy
Each copilot turn SHALL start from the editor's current working copy, including unsaved edits, not from the last saved version.

#### Scenario: Unsaved edits are kept
- **WHEN** the user edits a node without saving and then asks the copilot for an unrelated change
- **THEN** the proposed version still contains the user's unsaved edit

### Requirement: Progress is visible while the copilot works
The copilot SHALL acknowledge a message within one second, stream its reply text as it is written, show each step it takes (reading, editing a named node, validating) with the elapsed time of the turn, and SHALL disable sending until the turn ends.

#### Scenario: Immediate acknowledgement
- **WHEN** the user sends an instruction
- **THEN** within one second the panel shows a working indicator with a running timer, before the copilot has produced any output

#### Scenario: Streaming steps
- **WHEN** the copilot reads, edits and validates the agent
- **THEN** a step line appears for each action as it happens, the reply text appears word by word, and the input is disabled until the reply ends

### Requirement: Stop a running turn
While a turn is running the panel SHALL offer Stop, which ends the turn and shows no proposal from it.

#### Scenario: Stop
- **WHEN** the user clicks Stop during a turn
- **THEN** the turn ends within two seconds, the input is enabled again and the editor is unchanged

### Requirement: The proposal renders live on the canvas
While a turn is running, the canvas SHALL show the copilot's draft and update it after each edit the copilot makes, marking added nodes and edges as added, changed ones as changed and removed ones faded, and highlighting the node being edited. Existing nodes SHALL keep their positions; only new nodes are laid out.

#### Scenario: Graph grows as the copilot writes
- **WHEN** the copilot builds an agent from guidelines
- **THEN** the nodes and edges appear on the canvas during the turn, and each node's content fills in as it is written, before the reply ends

#### Scenario: Targeted edit
- **WHEN** the copilot changes the `offer_times` node
- **THEN** `offer_times` is highlighted while it is edited and stays marked as changed, and no other node moves

### Requirement: Inspect a proposal directly
While the canvas shows a draft or proposal, the user SHALL be able to select any node or edge and read its proposed content in the Inspector, read-only. Showing a proposal SHALL NOT change the working copy or mark the agent as unsaved.

#### Scenario: Inspect a proposed node
- **WHEN** the user clicks a node marked as added in a proposal
- **THEN** the Inspector shows its proposed instructions and edges, with editing disabled

#### Scenario: Hide the proposal
- **WHEN** the user clicks Hide or Discard
- **THEN** the canvas shows the working copy again, and the editor is not marked as unsaved

### Requirement: Proposals are validated before they are shown
The copilot SHALL check its proposal with the same validation rules as the editor and fix errors before replying. A proposal that still has issues SHALL be shown with those issues listed.

#### Scenario: Self-correction
- **WHEN** the copilot's first edit leaves an edge pointing at a node that does not exist
- **THEN** the copilot fixes it before replying, and the proposal reaches the user with no blocking issues

#### Scenario: Remaining issues
- **WHEN** the copilot cannot resolve a validation error
- **THEN** the proposal shows the remaining issues and Apply warns that the agent will not be callable until they are fixed

### Requirement: Changes list as a secondary view
Each proposal SHALL offer a collapsed Changes view listing added, removed and changed nodes and edges, where a changed item can be expanded to show its before and after text.

#### Scenario: Changes view
- **WHEN** the user expands Changes on a proposal that adds a node and changes one edge
- **THEN** it lists one added node and one changed edge, and expanding the edge shows its old and new description

### Requirement: Apply or discard a proposal
Applying a proposal SHALL load it into the editor as unsaved changes; discarding SHALL leave the editor as it was. The copilot SHALL never save an agent.

#### Scenario: Apply
- **WHEN** the user clicks Apply on a proposal
- **THEN** the canvas shows the proposed agent, the editor marks it as unsaved, and saving works as for manual edits

#### Scenario: Discard
- **WHEN** the user clicks Discard
- **THEN** the editor's working copy is unchanged and the proposal is marked discarded in the conversation

#### Scenario: Stale proposal
- **WHEN** the user edits the agent after a proposal arrives and then clicks Apply
- **THEN** the editor asks for confirmation because applying replaces those newer edits

### Requirement: Conversation continuity per agent
The copilot SHALL remember the conversation for the open agent across turns until the user starts a new conversation or the API restarts.

#### Scenario: Follow-up
- **WHEN** the user sends "make that shorter" after a proposal
- **THEN** the copilot changes the same part of the agent it changed in the previous turn

#### Scenario: New conversation
- **WHEN** the user clicks New chat
- **THEN** the conversation is cleared and the next turn starts with no memory of earlier turns

### Requirement: Clarify only when guidelines are ambiguous
When an instruction cannot be carried out without a decision only the user can make, the copilot SHALL ask one short question and propose no change in that turn. Otherwise it SHALL act without asking.

#### Scenario: Ambiguous instruction
- **WHEN** the user asks to "handle insurance questions" in an agent with no rule for them
- **THEN** the copilot asks whether to answer them or transfer to a human, and no proposal is shown

### Requirement: Generated agents follow healthcare voice conventions
Agents the copilot builds or extends SHALL use speakable replies (no lists, emojis or markdown), ask one question at a time, avoid medical advice, and include a path to end the call and to hand off urgent or out-of-scope calls, unless the user's guidelines say otherwise.

#### Scenario: New agent from guidelines
- **WHEN** the copilot builds an agent from guidelines that do not mention emergencies
- **THEN** the proposed agent still has an edge that tells urgent callers to hang up and call emergency services, and at least one end node

### Requirement: Copilot can only change the agent
The copilot SHALL only read and change the draft of the open agent. It SHALL NOT run commands, read or write other files, or save, create or delete agents.

#### Scenario: Out-of-scope request
- **WHEN** the user asks the copilot to delete another agent or run a shell command
- **THEN** the copilot declines in one sentence and nothing outside the open agent's proposal changes

### Requirement: Copilot unavailable
When the copilot backend cannot start (no Claude login or API key, or the Claude CLI is missing), the panel SHALL show the reason and how to fix it, and the rest of the editor SHALL keep working.

#### Scenario: Not logged in
- **WHEN** the user sends a message on a machine with no Claude login and no API key
- **THEN** the panel shows a setup message naming both options, and editing, saving and test calls still work
