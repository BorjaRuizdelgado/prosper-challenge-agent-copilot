# Spec Delta

## ADDED Requirements

### Requirement: Copilot works for the deployment team
The copilot SHALL address its user as a Prosper deployment engineer configuring a clinic client's agent. Its final reply SHALL stay one short paragraph without lists, JSON or file paths, SHALL name the nodes and edges it changed, SHALL state any default or assumption it took, and SHALL end with what to confirm with the client when it needed a clinic policy it did not have.

#### Scenario: Reply names what changed
- **WHEN** the copilot adds a staff handoff to three nodes
- **THEN** its reply names those nodes and the new edge's function name

#### Scenario: Assumption stated
- **WHEN** the copilot adds a cancel path to an agent with no cancellation policy
- **THEN** its reply says it took cancellations without a notice period and that the notice period should be confirmed with the client

#### Scenario: Client decision phrased as a question for the client
- **WHEN** an edit needs a clinic policy only the client can decide and has no safe default
- **THEN** the copilot asks one short question framed as what the client needs to decide, and proposes no change

### Requirement: Copilot panel speaks to deployment work
The Copilot panel's empty state SHALL describe what the Copilot does for a deployment engineer, and its example requests SHALL be deployment tasks: building from client guidelines, adding a missing path that needs an unknown clinic policy, fixing a reported problem, and a structural voice improvement.

#### Scenario: Empty chat
- **WHEN** the user opens the Copilot panel on an agent with no conversation
- **THEN** the examples include building from the client's guidelines and fixing a reported caller problem, and clicking one fills the input without sending
