# Spec Delta

## ADDED Requirements

### Requirement: Send a finished call to the copilot
After a call ends with a non-empty transcript, the Call tab SHALL offer "Ask Copilot". It SHALL open the Copilot tab with a message prefilled with the transcript and the nodes the call went through, and leave the user to say what went wrong before sending.

#### Scenario: Ask Copilot after a call
- **WHEN** a call has ended with a transcript and the user clicks "Ask Copilot"
- **THEN** the Copilot tab opens with the transcript and node path in the input, the cursor placed for the user to describe the problem, and nothing is sent until the user sends it

#### Scenario: No transcript
- **WHEN** a call failed before anyone spoke
- **THEN** "Ask Copilot" is not offered
