# test-call Specification

## Purpose

Lets a user talk to the agent they are editing from the browser, see the conversation as text, and see which node the agent is in, closing the build-and-try loop.

## Requirements

### Requirement: Start a call for a specific agent
The system SHALL start a voice session in the browser for the currently open agent, using its last saved version, and SHALL tell the user when the open version has unsaved changes.

#### Scenario: Call a saved agent
- **WHEN** the user clicks "Test call" on a saved, valid agent and grants microphone access
- **THEN** a session connects and the agent speaks from its initial node using that agent's persona, voice and model

#### Scenario: Unsaved changes
- **WHEN** the user starts a call with unsaved edits
- **THEN** the editor offers to save first, and never silently calls an outdated version

#### Scenario: Blocking validation errors
- **WHEN** the agent has blocking issues
- **THEN** the call control is disabled and states why

### Requirement: Call controls and states
The call panel SHALL show connection state (idle, connecting, live, ended, failed), and provide mute and hang-up while live.

#### Scenario: Microphone denied
- **WHEN** the user denies microphone permission
- **THEN** the panel shows an actionable message and returns to idle

#### Scenario: Backend unavailable or missing keys
- **WHEN** the voice backend cannot start the session
- **THEN** the panel shows a failed state with the reason and a retry action

#### Scenario: Hang up
- **WHEN** the user hangs up
- **THEN** the session closes, the microphone is released and the panel shows the ended state

### Requirement: Live transcript
The call panel SHALL show the conversation as alternating user and agent messages as they happen, and keep the transcript visible after the call ends until the next call starts.

#### Scenario: Speak and respond
- **WHEN** the user speaks and the agent replies
- **THEN** both utterances appear in order in the transcript

### Requirement: Active node tracking
During a call the graph SHALL highlight the node the conversation is currently in and the last transition taken, and SHALL clear the highlight when the call ends.

#### Scenario: Transition
- **WHEN** the agent takes an edge to another node
- **THEN** the target node becomes highlighted within one second and the transcript notes the transition and the data collected

### Requirement: Calls run the selected agent only
The voice backend SHALL load the agent chosen at session start by id and SHALL fail the session with a clear error if the id is unknown or invalid, rather than falling back to another agent.

#### Scenario: Unknown agent id
- **WHEN** a session is started with an unknown agent id
- **THEN** the session fails with an error naming the id

### Requirement: Send a finished call to the copilot
After a call ends with a non-empty transcript, the Test call tab SHALL offer "Ask Copilot". It SHALL open the Copilot panel with a message prefilled with the transcript and the nodes the call went through, and leave the user to say what went wrong before sending.

#### Scenario: Ask Copilot after a call
- **WHEN** a call has ended with a transcript and the user clicks "Ask Copilot"
- **THEN** the Copilot panel opens with the transcript and node path in the input, the cursor placed for the user to describe the problem, and nothing is sent until the user sends it

#### Scenario: No transcript
- **WHEN** a call failed before anyone spoke
- **THEN** "Ask Copilot" is not offered
