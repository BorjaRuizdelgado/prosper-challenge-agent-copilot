# Simple demo: Harbor Dental, reschedule line

A one-page client document with a known answer, so you can check the copilot's build against its source by eye in a few minutes. The larger, realistic sample (Maple Family Practice, ~640 words) is in `docs/guidelines-demo.md`.

Try it: `make dev`, open `http://localhost:5173`, **New from guidelines**, **Use sample: Harbor Dental Reschedule**, **Create and build**. Needs a logged-in `claude` CLI (or `ANTHROPIC_API_KEY`). Source files: `backend/demo/guidelines/harbor-dental-reschedule.md` (the document, 282 words), `.reply.md` (the client's answers), `.expected.json` (what a correct build contains, used by `make check-guidelines`).

## The document and its two gaps

The line has one job: callers who want to cancel or move an appointment they already have. It states seven rules and leaves two policies unsaid on purpose:

| | In the document | Planted gap |
| --- | --- | --- |
| 1 | Greet as the reschedule line; ask name and date of birth to find the appointment | |
| 2 | Cancel on request after confirming which appointment | "enough notice when they cancel" with **no notice window** (a) |
| 3 | Reschedule: offer the next available times, caller picks one, repeat the new date and time | |
| 4 | Cannot find the appointment: do not guess, pass to the front desk | "give them our front desk number" with **no number** (b) |
| 5 | No medical advice; pain, swelling or bleeding: 911 if severe, else staff | |
| 6 | One question at a time, short and polite | |
| 7 | Outside office hours take a message for the front desk | |

The reply gives both: 24 hours' notice (inside 24 hours, call the front desk) and the number `555-0142`.

## What to find in the result

| Rule in the document | What to find in the graph |
| --- | --- |
| 1 name and date of birth | the first nodes ask for name and date of birth, one question each (in a Haiku run: `greeting`, `collect_dob`) |
| 2 cancel | a node that confirms which appointment, then cancels (`cancel_confirm`, `cancel_done`) |
| (a) notice window | a **question** about the notice window; its default asks for "enough notice" without naming a time. The agent must not say any number of hours or days before the reply |
| 3 reschedule | a node that offers times, one that repeats the new time back (`offer_times`, `reschedule_confirm`) |
| 4 not found | an edge such as `appointment_not_found` to a front-desk handoff |
| (b) front-desk number | a **question** about the number; its default hands the caller to staff without reading a number. No phone number appears in any node |
| 5 medical advice | a node or edge for pain, swelling, bleeding, with a 911 exit and a staff handoff |
| 6 brief, one question | in the persona or the task messages |
| 7 outside hours | an after-hours edge to a node that takes a message |

In the coverage card: each rule is *Covered*; the two gaps appear under *Questions for the client* with their defaults. The model also tends to add a few honest questions of its own (office hours, where the times come from, a caller who is not the patient, slot length). After **Use sample client reply** and **Send**, the two answered questions disappear and the agent says "24 hours" and the number (a voice agent may spell the number digit by digit; the check accepts that).

## The check

`make check-guidelines` (`MODEL=sonnet`, `DUMP=file.json`) builds the sample on a throwaway agent, sends the reply, and prints a row per expectation: validation errors, each topic found in a node (keyword match, printed), each gap asked as a question, at most `gaps + 2` questions, no invented number or window before the reply, the reply's `24` and `555-0142` present afterwards, and no question left on either gap. It needs the `claude` CLI and never runs in CI; the comparison itself is unit-tested with hand-made data (`backend/tests/test_check_build.py`). Keyword matching is crude on purpose: read a failing row before calling it a regression.

### Measured runs (2026-10-30)

Single runs, not averages. Haiku is the demo default. Two real runs on Haiku, one on Sonnet (the plan allowed two per model; a second Sonnet run was not spent).

| Run | Requirements | Questions | Build | Reply turn | Expectations that held | Failures |
| --- | --- | --- | --- | --- | --- | --- |
| Haiku 1 | 19 | 6 (after reply: 4) | 93.3 s | 37.2 s | 14 of 18 | topic `appointment-not-found`; `questions-not-a-flood` (6 > 4); `has:24` and `has:555-0142` |
| Haiku 2 | 18 | 6 (after reply: 4) | 92.3 s | 30.0 s | 16 of 18 as run, 17 of 18 with the final expectations | `questions-not-a-flood` (6 > 4); as run also `appointment-not-found` |
| Sonnet 1 | 11 | 4 (after reply: 2) | 60.4 s | 26.1 s | 17 of 18 as run, 18 of 18 with the final expectations | as run: `has:555-0142` |

What the failures were, each looked at by hand:

- **`has:555-0142` (Sonnet 1)**: not a miss. The agent wrote "five five five, zero one four two" in a node, which is what a voice agent should do. The check compared the literal string. Fixed in the check (commit "Accept a number spelled out digit by digit"), and the saved output of that run re-evaluated: pass. Haiku 1 failed `has:24` and `has:555-0142` too; I did not save its drafts, so I did not look at why (it may be the same spelled-out form); Haiku 2 passed both.
- **`appointment-not-found` (Haiku 1 and 2)**: a keyword miss, not a build miss. Haiku 2's graph has the edge `appointment_not_found` ("Call if the appointment cannot be found.") to `transfer_to_staff`; the expectation looked for "cannot find" and "not found". Keywords widened to "cannot be found" and "not_found" (own commit) and Haiku 2's saved output re-evaluated: pass. This widens a keyword after seeing output; the graph was checked by hand first.
- **`questions-not-a-flood` (Haiku 1 and 2)**: a real failure of the expectation, not changed. Haiku asked 6 questions for 2 planted gaps in both runs: besides the two gaps, office hours, where the offered times come from, slot length and a caller who is not the patient. They are reasonable questions, but more than the plan's limit of 4. Sonnet asked 4 and passed.
- No run invented a number or a window before the reply, no run had validation errors, and on every run both planted gaps became questions and were gone after the reply.

No prompt or skill change was made for this sample. The requirement counts (11 to 19) are well above the "about seven" of the plan: the models split rules into finer requirements, so compare topics, not counts.

## Browser run with the real copilot (task 5.2 of change 2, steps 6 and 7)

Playwright (Chromium, 1440x900) driving the Vite app against a throwaway agents directory and the real copilot on the default model (Haiku). Times are from the script's clock.

| Step | Observed |
| --- | --- |
| *New from guidelines*, both sample buttons, pick the small one, *Create and build* | dialog lists *Use sample: Harbor Dental Reschedule* then *Use sample: Maple Family Practice*; name and text filled (282 words); after create the editor opened and the copilot started |
| The card | **95.3 s** after Create: *Covers 17 of 18 requirements · 6 questions for the client*; the turn finished at 98.2 s with a proposal card (11 nodes added, 1 node changed, 20 edges added, 1 setting changed) |
| *Apply* the build | card became *Applied*, 12 nodes on the canvas, header *Unsaved changes* |
| *Copy as email* | toast *Questions copied*; the clipboard began "Hello, We have set up the phone agent "Harbor Dental Reschedule" from your guidelines..." with 6 numbered questions and their defaults |
| *Use sample client reply* | the input filled with 274 characters; nothing sent (1 turn so far) |
| *Send* | the turn ran, the updated card appeared **23.6 s** after Send (turn finished at 27.0 s): *Covers 17 of 18 requirements · 4 questions for the client*, with a second proposal (1 node added, 2 nodes changed, 1 edge added) |
| Updated card | the notice and front-desk-number questions are no longer there; **4 questions remain, not none**: the model's own extra questions (connecting the scheduling system, family members cancelling for someone else, how many reschedule times to offer and where they come from, office hours). The plan expected zero; with this model it did not happen |
| *Apply* the reply | card became *Applied*, 13 nodes, *Unsaved changes* |
| *Check coverage* on the seeded Riverside Clinic Scheduler | **30.2 s** to the card: *Covers 3 of 12 requirements · 9 questions for the client* (the earlier run on this agent: 4 of 15 and 10 questions; counts vary per run) |

The page errors list was empty.

How this differs from the earlier attempt and what it showed:

- The earlier run (`docs/guidelines-demo.md`) waited 400 s for a second card after *Send* and timed out. It did not reproduce: here *Send* gave the updated card in 23.6 s. I could not recover why the first script waited; this run's script waited for a second `Coverage` region (a second card is appended per reply) and for the *Stop* button to go away, which the page did in time, so there is no evidence of a page fault.
- A first attempt at this run (not counted above) went through an already running API on port 8000 that was not mine (its agents directory), sent the reply **without applying the build first**, and then could not find *Check coverage* because that server's seeded scheduler had no guidelines. The reply turn then took 51.0 s to the card and proposed "12 nodes added" over the starter agent: the working copy sent with each turn is the applied agent, so a reply sent before *Apply* makes the copilot work from the old graph. Apply the build first, then answer the client. That attempt's agent was deleted. This means the browser path was run twice against the real copilot (the plan allowed one); the second one is the clean run reported above.
