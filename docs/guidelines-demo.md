# Build from client guidelines: real-model check

Manual run of the `client-guidelines` scenarios (change 2, tasks 5.1 and 5.2) against the real copilot (Claude through the Agent SDK, logged-in `claude` CLI), with `backend/demo/guidelines/maple-family-practice.md`. Measured on 2026-10-30. Model output varies from run to run, so these are single observed runs, not averages.

The five gaps planted in the sample: **(a)** no cancellation notice window, **(b)** "most major insurance" with no list, **(c)** new-patient visit length not stated, **(d)** after-hours nurse line without a number, **(e)** no rule for a caller who is not the patient.

## 1. Build and answer turn through `run_turn` (task 5.1)

Each run: a new agent with the sample as guidelines, the fixed request *Build this agent from the client's guidelines.*, then the canned sample client reply as the next turn.

| Run | Model | Requirements | Questions | Planted gaps that became questions | Validation issues | Build time | Answer turn |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1, before the prompt change | Haiku | 28 | 6 | (b); (a) only as "may it cancel itself?", not a notice window; (c), (d), (e) not asked | 0 | 132 s | 7 questions; insurance question removed; nurse line and third-party questions appeared only now |
| 1, before the prompt change | Sonnet | 17 | 5 | (b), (d); (a), (c), (e) missing | 0 | 77 s | 5 questions; insurance removed, third-party question added |
| 2, after the prompt change | Sonnet | 19 | 6 | (a), (b), (c) (bundled with slot availability), (d), (e): 5 of 5 | 0 | 66 s | 3 questions: notice, insurance and visit length removed; nurse line, third-party and holidays remain; 0 issues; 28 s |
| 2, after the prompt change | Haiku | 25 | 8 | (a), (b), (c), (d), (e): 5 of 5 | 0 | 104 s | 5 questions: notice, insurance and visit length removed; 0 issues; 41 s |

The first runs found only 2 of 5 gaps on either model, so `prosper-blueprints/SKILL.md` got one added paragraph (commit e9f1a85) before run 2: when building from guidelines, also look for what the document omits (notice periods, named lists behind "most"/"major", durations, numbers it mentions but does not give, a caller who is not the patient, hours edge cases) and make each silence a *default* requirement with a question. Before it, models treated a topic as covered once the document stated the rule, even where a detail was missing. The paragraph is general (no sample-specific wording). One run per model per version; no further tuning was done.

Answer turn (sample client reply: 24 hours' notice, Aetna/Blue Cross/UnitedHealthcare, 40-minute new-patient visits; nurse line and third-party still open): on both models in run 2 the three answered questions disappeared from the new report and the unanswered ones stayed, with 0 validation issues.

## 2. Through the browser, default model (Haiku), real API (task 5.2)

Playwright driving the Vite app against a throwaway agents directory seeded with `demo.seed` (what `make demo` runs).

**Short path: Riverside Clinic Scheduler, Check coverage.** The card appeared 39.7 s after the click: *Covers 4 of 15 requirements · 10 questions for the client*. Covered: collect details, offer times, confirm. **Open: cancelling, rescheduling and transfer to front-desk staff**, plus the urgent-caller exit, a rejected offer, a third-party caller, outside hours, notice period, front-desk number and slot length. Its questions default cancel, reschedule and transfer to a staff handoff. This matches the Demo section.

**Full path: New from guidelines, sample, Create.** The coverage card arrived 179.0 s after Create (the graph grew while it ran): *Covers 31 of 31 requirements · 6 questions for the client* (24 covered, 7 covered with a default). Planted gaps asked as questions: (a), (b), (c) and (d). Not asked: (e). So 4 of 5 on the demo model. *Copy as email* put the six numbered questions with their defaults on the clipboard. *Use sample client reply* filled the input (601 characters) without sending.

**Not verified in the browser:** after *Send* of the sample reply, my script waited for a second coverage card and timed out at 400 s. The request reached the API (HTTP 200), but I did not record what the page showed, so the updated card, its time in the UI and the final Apply step (steps 6 and 7 of the full path) were not observed. The answer turn itself is measured in section 1 (28 to 41 s). Task 5.2 is therefore left unticked. Screenshots from the run are not committed.

## Known issues

- Which gaps become questions varies per run: in the browser run the third-party caller rule was missed on Haiku, while the `run_turn` runs found it.
- The count line counts defaults as covered, so a build can read "31 of 31" while 6 questions remain for the client.
- Requirement counts differ widely between models and runs (17 to 31 for the same document).
