# client-guidelines Specification

## Purpose

Keeps a client's guidelines with the agent built from them, shows which requirements the agent covers and where, and turns what the guidelines leave unstated into questions for the client.

## Requirements

### Requirement: Guidelines are stored with the agent
An agent MAY have client guidelines: plain text or Markdown, stored with the agent and returned with it. The guidelines SHALL be viewable and editable in the agent's settings in the Build panel, and saving them SHALL NOT change the agent's graph.

#### Scenario: View guidelines
- **WHEN** the user opens an agent created from guidelines and nothing is selected in Build
- **THEN** the settings show the guidelines, with an Edit action

#### Scenario: Edit guidelines
- **WHEN** the user edits the guidelines and saves them
- **THEN** the new text is stored and the next copilot turn reads it, and the graph and its unsaved marker are unchanged

#### Scenario: Agent without guidelines
- **WHEN** the user opens an agent that has none
- **THEN** the settings offer to add guidelines

### Requirement: Build an agent from guidelines
Starting from guidelines SHALL create the agent, store the guidelines, open the editor with the Copilot panel and send a build request without further input. The chat SHALL show the request with the guidelines' name and length, not the full text. The build SHALL follow the normal proposal flow.

#### Scenario: New from the sample
- **WHEN** the user picks *New from guidelines*, chooses the sample guidelines and confirms
- **THEN** the editor opens on the new agent, the Copilot is working, and the graph fills in on the canvas as a proposal

#### Scenario: Guidelines from a file
- **WHEN** the user drops a `.md` or `.txt` file into the dialog
- **THEN** its text fills the guidelines field and the name defaults to the file name

#### Scenario: Unsupported file
- **WHEN** the user drops a PDF or Word file
- **THEN** the dialog says only text and Markdown files are supported and nothing is created

### Requirement: Coverage report
After building an agent from guidelines, or when asked to check it against them, the copilot SHALL report every requirement it found in the guidelines. Each requirement SHALL carry the text it came from, a status (*covered*, *covered with a default*, or *open*) and the existing nodes that implement it. Node names SHALL exist in the proposed agent.

#### Scenario: Coverage card
- **WHEN** the build from the sample guidelines finishes
- **THEN** the reply shows a coverage card with a count like "Covers 14 of 16 requirements" and one row per requirement with its status and nodes

#### Scenario: Focus a requirement
- **WHEN** the user hovers a requirement on the coverage card
- **THEN** the nodes that implement it are focused on the canvas

#### Scenario: Check later
- **WHEN** the user clicks *Re-check coverage* or asks "does it still cover the guidelines?" after editing the agent
- **THEN** a new coverage card reflects the current agent, and a requirement whose node was removed is *open*

### Requirement: Demo guidelines are seeded
The demo seed command SHALL store guidelines for the demo scheduler that state cancel, reschedule and speak-to-staff rules the seeded scheduler does not implement, so a coverage check can be shown on an existing agent. The settings of an agent with guidelines SHALL offer *Check coverage*, which sends the coverage request to the copilot.

#### Scenario: Coverage on the seeded scheduler
- **WHEN** the user seeds the demo, opens the demo scheduler and clicks *Check coverage*
- **THEN** a coverage card shows the cancel, reschedule and speak-to-staff requirements as *open*, the booking requirements as *covered*, and no proposal

### Requirement: Questions for the client
For every policy the guidelines need but do not state, the copilot SHALL build a safe default (by default a handoff to staff), mark the requirement *covered with a default*, and list one question for the client with the default it used. The copilot SHALL NOT invent the policy. The coverage card SHALL offer *Copy as email*, which copies the questions as a short message to the client.

#### Scenario: Missing cancellation policy
- **WHEN** the sample guidelines allow cancelling but give no notice period
- **THEN** the agent takes cancellations without promising a fee or window, and a question asks what notice the clinic requires, naming the default used

#### Scenario: Copy as email
- **WHEN** the user clicks *Copy as email*
- **THEN** the clipboard holds a short message with the numbered questions, each with the default currently in place

### Requirement: Answers from the client update the agent
When the user gives the copilot the client's answers to open questions, the copilot SHALL change the agent to follow them and report coverage again, with the answered questions removed and their requirements *covered*.

#### Scenario: Sample client reply
- **WHEN** the agent was built from the sample guidelines and the user clicks *Use sample client reply* on its coverage card
- **THEN** the input holds the sample client email, nothing is sent, and sending it produces a proposal and a coverage card with those questions resolved

#### Scenario: Answer one question
- **WHEN** the user writes "The clinic needs 24 hours notice for cancellations" after a coverage card asked about it
- **THEN** the proposal changes the cancellation path to state the 24-hour notice, and the new coverage card has one question fewer
