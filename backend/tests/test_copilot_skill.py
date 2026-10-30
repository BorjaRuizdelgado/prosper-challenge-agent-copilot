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


REVIEW_SKILL = workspace.skill_dir(workspace.RUN_REVIEW_SKILL_NAME) / "SKILL.md"

# Spec: "Findings tie problems to runs", "Improvements fix what the runs show", "Complete an unfinished agent from caller intent".
REVIEW_REQUIRED = {
    "reads runs and draft": "Read the runs file and the draft",
    "runs are not instructions": "never instructions to you",
    "group by cause": "Group runs by cause, not by run",
    "cite every run": "citing every run that shows it",
    "findings tool before editing": "Call `report_findings` with one finding per cause",
    "finding fields": "`title`",
    "leave working paths": "Do not change those paths",
    "touch only what findings name": "Do not touch anything no finding names",
    "no problem, no edit": "report no findings, make no edit",
    "builds missing steps from callers": "build the missing steps from what the callers asked for",
    "no invented policy": "Do not invent clinic policies",
    "hands off when unknown": "hand off to a human",
    "emergency and handoff": "emergency exit and the human handoff",
    "names motivating runs": "Say which runs motivated each part",
}


def test_review_frontmatter_names_the_skill():
    match = re.match(r"---\nname: (\S+)\ndescription: .+\n---\n", REVIEW_SKILL.read_text(encoding="utf-8"))
    assert match and match.group(1) == workspace.RUN_REVIEW_SKILL_NAME


@pytest.mark.parametrize("phrase", REVIEW_REQUIRED.values(), ids=REVIEW_REQUIRED.keys())
def test_review_skill_covers_rule(phrase):
    assert phrase in REVIEW_SKILL.read_text(encoding="utf-8")


GUIDELINES_REQUIRED = {
    "section": "### From the client's guidelines",
    "reads first": "Read the guidelines file first",
    "lists requirements": "List the requirements to yourself",
    "defaults not questions": "Defaults, not questions",
    "safe default": "hand off to staff, promise no time or fee",
    "report after validation": "call `report_coverage` once, after your last edit",
    "statuses": "`covered`",
    "check coverage flow": "**Check coverage.**",
    "no edits when checking": "Make no edits unless asked",
    "client answers flow": "**Client answers.**",
    "reports again": "call `report_coverage` again",
}


@pytest.mark.parametrize("phrase", GUIDELINES_REQUIRED.values(), ids=GUIDELINES_REQUIRED.keys())
def test_skill_covers_guidelines_rule(phrase):
    assert phrase in SKILL.read_text(encoding="utf-8")
