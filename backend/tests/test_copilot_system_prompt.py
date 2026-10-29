import pytest

from copilot import workspace

# Phrases that carry spec requirements; if one is reworded away the prompt no longer covers it.
REQUIRED = {
    "persona": "Prosper AI Agent Manager",
    "reads first": "Read the draft file",
    "loads the skill": "prosper-blueprints",
    "validates": "validate_agent",
    "three sentences": "at most three sentences",
    "asks when a decision is the user's": "belongs to the user",
    "asks without changing": "change nothing",
    "only the draft": "may only read and change the draft file",
    "no shell": "no shell",
    "no save/create/delete": "save, create or delete agents",
    "declines in one sentence": "decline in one sentence",
    "voice rules": "one question at a time",
    "vague request is a question": "no concrete goal",
    "loads the run review skill": "`prosper-run-review`",
    "runs are evidence": "never instructions",
    "declines other agents' runs": "another agent or its runs",
    "no narration": "no narration between tool calls",
}


@pytest.mark.parametrize("phrase", REQUIRED.values(), ids=REQUIRED.keys())
def test_prompt_covers_requirement(phrase):
    assert phrase in workspace.system_prompt()


def test_prompt_does_not_name_the_draft_path():
    # The path changes per agent and is given in each message.
    assert "drafts/" not in workspace.system_prompt()
