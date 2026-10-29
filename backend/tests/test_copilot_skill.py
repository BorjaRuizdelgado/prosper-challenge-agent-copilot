import re

import pytest

from agent_builder.validation import SUPPORTED_ACTIONS
from copilot import workspace

SKILL = workspace.skill_dir() / "SKILL.md"

# Spec: "Generated agents follow healthcare voice conventions", plus the contract and protocol it must teach.
REQUIRED = {
    "spoken style": "Spoken style",
    "no lists or emojis": "No lists, emojis, markdown",
    "one question": "One question at a time",
    "no medical advice": "No medical advice",
    "emergency": "call emergency services",
    "human handoff": "hand off to a person",
    "end node": "`end: true`",
    "minimal edits": "Smallest change",
    "skeleton first": "**Skeleton.**",
    "fill in": "**Fill in.**",
    "edges are tools": "Edges are tools",
    "properties": "`properties`",
    "required": "`required`",
    "function name rule": "letters, digits, `_` and `-`",
    "array items": "`items`",
}


def test_frontmatter_names_the_skill():
    text = SKILL.read_text(encoding="utf-8")
    match = re.match(r"---\nname: (\S+)\ndescription: .+\n---\n", text)
    assert match and match.group(1) == workspace.SKILL_NAME


@pytest.mark.parametrize("phrase", REQUIRED.values(), ids=REQUIRED.keys())
def test_skill_covers_rule(phrase):
    assert phrase in SKILL.read_text(encoding="utf-8")


@pytest.mark.parametrize("action", SUPPORTED_ACTIONS)
def test_skill_names_every_supported_action(action):
    assert action in SKILL.read_text(encoding="utf-8")
