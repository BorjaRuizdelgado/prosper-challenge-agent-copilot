# Spec Delta

## MODIFIED Requirements

### Requirement: Agents list UI
The UI SHALL list all agents on a home page and in a switcher opened from the open agent's name in the editor's top bar, let the user create (empty, or from client guidelines), rename, duplicate and delete them (with delete confirmation), and open one into the editor via a shareable URL. Duplicating an agent SHALL copy its guidelines, and deleting it SHALL delete them.

#### Scenario: Create and open
- **WHEN** the user clicks "New agent" and enters a name
- **THEN** the agent appears in the list and is opened in the editor at its own URL

#### Scenario: Create from guidelines
- **WHEN** the user clicks "New from guidelines", enters a name and guidelines, and confirms
- **THEN** the agent appears in the list with its guidelines stored, and is opened in the editor with the copilot building it

#### Scenario: Duplicate keeps guidelines
- **WHEN** the user duplicates an agent that has guidelines
- **THEN** the copy has the same guidelines

#### Scenario: Empty and error states
- **WHEN** the list is empty or the API is unreachable
- **THEN** the UI shows an empty state with both create actions, or an error with a retry action, instead of a blank screen
