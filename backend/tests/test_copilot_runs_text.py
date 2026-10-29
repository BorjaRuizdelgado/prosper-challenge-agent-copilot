from copilot.runs_text import render_runs

FLAGGED = {
    "id": "r-1042",
    "started_at": "2026-10-21T09:14:00Z",
    "duration_s": 96,
    "outcome": "abandoned",
    "flag": "Caller wanted to cancel and could not.",
    "transcript": [
        {"speaker": "agent", "text": "Thanks for calling Riverside Clinic. Would you like to book an appointment?"},
        {"speaker": "caller", "text": "I need to cancel my appointment on Friday."},
    ],
    "path": [
        {"node": "greeting"},
        {"node": "collect_details", "via": "book_appointment", "args": {"reason": "cough"}},
        {"node": "confirm", "via": "details_collected"},
    ],
}

SNAPSHOT = """\
run r-1042 · abandoned · 1m36s · flag: Caller wanted to cancel and could not.
path: greeting -> collect_details (book_appointment: {"reason": "cough"}) -> confirm (details_collected)
Agent: Thanks for calling Riverside Clinic. Would you like to book an appointment?
Caller: I need to cancel my appointment on Friday.
"""


def test_renders_a_flagged_run_with_args_and_a_via_without_args():
    assert render_runs([FLAGGED]) == SNAPSHOT


def test_unflagged_short_runs_and_several_blocks():
    plain = {**FLAGGED, "id": "r-2", "duration_s": 45, "outcome": "completed", "path": [{"node": "greeting"}], "transcript": []}
    del plain["flag"]
    text = render_runs([FLAGGED, plain])
    assert text.endswith("\n\nrun r-2 · completed · 45s\npath: greeting\n")
    assert text.startswith(SNAPSHOT.rstrip("\n"))
