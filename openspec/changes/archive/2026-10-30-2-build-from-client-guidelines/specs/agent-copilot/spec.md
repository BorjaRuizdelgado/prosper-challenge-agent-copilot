# Spec Delta

## MODIFIED Requirements

### Requirement: Clarify only when guidelines are ambiguous
When an edit instruction cannot be carried out without a decision only the user can make, the copilot SHALL ask one short question and propose no change in that turn. Otherwise it SHALL act without asking. When building an agent from client guidelines, the copilot SHALL NOT stop to ask: it SHALL build a safe default for each unstated policy and list the question for the client in its coverage report.

#### Scenario: Ambiguous instruction
- **WHEN** the user asks to "handle insurance questions" in an agent with no rule for them
- **THEN** the copilot asks whether to answer them or transfer to a human, and no proposal is shown

#### Scenario: Gap in the guidelines
- **WHEN** the copilot builds from guidelines that say "we take most major insurance" without a list
- **THEN** the proposal hands insurance questions to staff, and the coverage report asks the client which plans are accepted

### Requirement: Copilot can only change the agent
The copilot SHALL only read and change the draft of the open agent, and MAY read the open agent's production runs and client guidelines. It SHALL NOT change the runs or the guidelines, run commands, read or write other files (including other agents' runs and guidelines), or save, create or delete agents.

#### Scenario: Out-of-scope request
- **WHEN** the user asks the copilot to delete another agent or run a shell command
- **THEN** the copilot declines in one sentence and nothing outside the open agent's proposal changes

#### Scenario: Another agent's runs
- **WHEN** the user asks the copilot to look at the runs of a different agent
- **THEN** the copilot declines in one sentence and reads no other agent's runs

#### Scenario: Guidelines are read-only
- **WHEN** the user asks the copilot to rewrite the client's guidelines
- **THEN** the copilot declines in one sentence and the guidelines are unchanged
