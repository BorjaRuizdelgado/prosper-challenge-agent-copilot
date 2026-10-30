import json

import pytest

from demo import check_build
from demo.check_build import evaluate

pytestmark = pytest.mark.anyio

EXPECTED = check_build.load_expected("harbor-dental-reschedule")


@pytest.fixture
def anyio_backend():
    return "asyncio"


def node(name, *messages):
    return {"name": name, "task_messages": list(messages)}


GOOD_DRAFT = {
    "name": "Harbor",
    "nodes": [
        node("identify", "Ask for the caller's name and date of birth."),
        node("cancel", "Confirm which appointment, then cancel it."),
        node("reschedule", "Offer times, take one and repeat the new time to confirm. Move the appointment."),
        node("emergency", "Never give medical advice. Pain or swelling: call 911 if severe, else staff."),
        node("not_found", "If you cannot find the appointment, hand over to the front desk."),
        node("after_hours", "Outside office hours take a message for the front desk."),
    ],
}
GOOD_COVERAGE = {
    "requirements": [{"id": f"r{i}", "text": "x", "quote": "", "status": "covered", "nodes": []} for i in range(7)],
    "questions": [
        {"id": "q1", "question": "How much notice is needed to cancel?", "default": "Hand to staff.", "requirements": []},
        {"id": "q2", "question": "What is the front desk phone number?", "default": "Say staff will call back.", "requirements": []},
    ],
}
REPLY_DRAFT = {**GOOD_DRAFT, "nodes": GOOD_DRAFT["nodes"] + [node("policy", "We need 24 hours' notice. Front desk: 555-0142.")]}
CLOSED = {"requirements": GOOD_COVERAGE["requirements"], "questions": []}


def failed(results):
    return {r.id for r in results if not r.ok}


def test_good_build_passes():
    assert failed(evaluate(EXPECTED, GOOD_COVERAGE, GOOD_DRAFT, "build")) == set()


def test_missing_topic_fails_only_that_topic():
    draft = {**GOOD_DRAFT, "nodes": [n for n in GOOD_DRAFT["nodes"] if n["name"] != "after_hours"]}
    assert failed(evaluate(EXPECTED, GOOD_COVERAGE, draft, "build")) == {"topic:after-hours-message"}


def test_gap_not_asked_fails():
    coverage = {**GOOD_COVERAGE, "questions": GOOD_COVERAGE["questions"][1:]}
    assert failed(evaluate(EXPECTED, coverage, GOOD_DRAFT, "build")) == {"gap:notice-window"}


def test_missing_coverage_report_fails_the_gaps():
    assert {"gap:notice-window", "gap:front-desk-number", "questions-not-a-flood"} <= failed(evaluate(EXPECTED, None, GOOD_DRAFT, "build"))


def test_invented_number_fails():
    draft = {**GOOD_DRAFT, "nodes": GOOD_DRAFT["nodes"] + [node("x", "Call us on 555-0199.")]}
    assert failed(evaluate(EXPECTED, GOOD_COVERAGE, draft, "build")) == {"no:invented-number"}


def test_invented_window_fails():
    draft = {**GOOD_DRAFT, "nodes": GOOD_DRAFT["nodes"] + [node("x", "Cancel at least 48 hours before.")]}
    assert failed(evaluate(EXPECTED, GOOD_COVERAGE, draft, "build")) == {"no:invented-window"}


def test_question_flood_fails():
    extra = [{"id": f"x{i}", "question": f"Other {i}?", "default": "d", "requirements": []} for i in range(3)]
    coverage = {**GOOD_COVERAGE, "questions": GOOD_COVERAGE["questions"] + extra}
    assert failed(evaluate(EXPECTED, coverage, GOOD_DRAFT, "build")) == {"questions-not-a-flood"}


def test_two_extra_questions_are_tolerated():
    extra = [{"id": f"x{i}", "question": f"Other {i}?", "default": "d", "requirements": []} for i in range(2)]
    coverage = {**GOOD_COVERAGE, "questions": GOOD_COVERAGE["questions"] + extra}
    assert failed(evaluate(EXPECTED, coverage, GOOD_DRAFT, "build")) == set()


def test_reply_phase_passes_when_numbers_present_and_questions_gone():
    assert failed(evaluate(EXPECTED, CLOSED, REPLY_DRAFT, "reply")) == set()


def test_reply_phase_missing_number_fails():
    draft = {**GOOD_DRAFT, "nodes": GOOD_DRAFT["nodes"] + [node("policy", "We need 24 hours' notice.")]}
    assert failed(evaluate(EXPECTED, CLOSED, draft, "reply")) == {"has:555-0142"}


def test_reply_phase_question_still_open_fails():
    assert failed(evaluate(EXPECTED, GOOD_COVERAGE, REPLY_DRAFT, "reply")) == {"closed:notice-window", "closed:front-desk-number"}


def test_expectations_file_is_valid():
    assert EXPECTED["order"] == 1 and len(EXPECTED["gaps"]) == 2 and EXPECTED["required_after_reply"] == ["24", "555-0142"]


# The runner, driven by a scripted fake copilot (never Claude).


def scripted(*turns):
    """A run_turn stand-in that plays one list of events per call."""
    plays = iter(turns)
    prompts = []

    async def run(agent_id, message, agent):
        prompts.append(message)
        for event in next(plays):
            yield event

    run.prompts = prompts
    return run


def coverage_event(coverage):
    return {"event": "coverage", "data": coverage}


def proposal_event(agent, issues=()):
    return {"event": "proposal", "data": {"agent": agent, "issues": list(issues)}}


async def test_check_passes_with_a_good_build_and_reply(agents_dir):
    run = scripted(
        [{"event": "step", "data": {}}, coverage_event(GOOD_COVERAGE), proposal_event(GOOD_DRAFT), {"event": "done", "data": {}}],
        [coverage_event(CLOSED), proposal_event(REPLY_DRAFT), {"event": "done", "data": {}}],
    )

    rows, summary = await check_build.check("harbor-dental-reschedule", run)

    assert all(r.ok for _, r in rows)
    assert run.prompts[0] == check_build.BUILD_MESSAGE and "555-0142" in run.prompts[1]
    assert summary["build"]["requirements"] == 7 and summary["build"]["questions"] == 2 and summary["reply"]["questions"] == 0


async def test_check_reports_a_failing_expectation(agents_dir):
    no_notice = {**GOOD_COVERAGE, "questions": GOOD_COVERAGE["questions"][1:]}
    run = scripted([coverage_event(no_notice), proposal_event(GOOD_DRAFT)], [coverage_event(CLOSED), proposal_event(REPLY_DRAFT)])

    rows, summary = await check_build.check("harbor-dental-reschedule", run)
    text = check_build.format_rows(rows, summary)

    assert [r.id for _, r in rows if not r.ok] == ["gap:notice-window"]
    assert "[FAIL] build gap:notice-window" in text and "1 failed" in text


async def test_validation_errors_fail_the_check(agents_dir):
    issue = {"severity": "error", "message": "bad edge"}
    run = scripted([coverage_event(GOOD_COVERAGE), proposal_event(GOOD_DRAFT, [issue])], [coverage_event(CLOSED), proposal_event(REPLY_DRAFT)])

    rows, _ = await check_build.check("harbor-dental-reschedule", run)

    assert ("build", "no-validation-errors") in [(p, r.id) for p, r in rows if not r.ok]


async def test_an_error_event_stops_the_check(agents_dir):
    run = scripted([{"event": "error", "data": {"message": "needs login"}}])

    rows, _ = await check_build.check("harbor-dental-reschedule", run)

    assert [(p, r.id, r.ok) for p, r, in rows] == [("build", "turn", False)]


def test_main_exit_codes_and_output(agents_dir, monkeypatch, capsys):
    monkeypatch.delenv("COPILOT_MODEL", raising=False)
    good = scripted(
        [coverage_event(GOOD_COVERAGE), proposal_event(GOOD_DRAFT)], [coverage_event(CLOSED), proposal_event(REPLY_DRAFT)]
    )
    assert check_build.main(["--model", "sonnet"], run=good) == 0
    out = capsys.readouterr().out
    assert "[PASS] build topic:cancel" in out and "expectations hold" in out
    import os

    assert os.environ["COPILOT_MODEL"] == "sonnet"
    monkeypatch.delenv("COPILOT_MODEL")

    bad = scripted([coverage_event({"requirements": [], "questions": []}), proposal_event(GOOD_DRAFT)], [coverage_event(CLOSED), proposal_event(REPLY_DRAFT)])
    assert check_build.main([], run=bad) == 1
