# Production runs demo script

Manual run of the `production-runs` and run-review scenarios (task 7.2). Needs a logged-in `claude` CLI (or `ANTHROPIC_API_KEY`). In the UI: `make demo`, `make dev`, open the demo agent, **Runs** tab (top bar). `make demo` resets the three demo agents, so run it again after an Apply + Save.

Each row can be tried in the UI (Runs tab, *Analyze runs*) or without it, through `run_turn` (see "To watch a real turn" in `backend/copilot/README.md`; the agent is `backend/demo/agents/<id>.json` and the message is the one in the table). Observed through `run_turn` on 2026-10-30, with the default Haiku and with `COPILOT_MODEL=sonnet`.

| # | Agent and message | Expect | Haiku (default) | Sonnet |
| --- | --- | --- | --- | --- |
| 1 | `demo-riverside-scheduler`: *Analyze runs* (`Review this agent's production runs. Tell me what went wrong and improve the agent.`) | Steps *Reading agent*, *Loading run review*, *Reporting N findings* before any *Editing …*; findings that cite run ids (cancel/reschedule loop, four questions at once); intake split into one node per question; a human handoff; the booking path (`greeting` → `collect_details` → `offer_times` → `confirm`) unchanged apart from the split. | 4 findings (no way to cancel or reach a person, ignored mid-intake, four questions, no emergency exit) citing r-1004 to r-1009. `collect_details` split into name, date of birth, reason and preferred time nodes, `transfer_to_staff` and `report_emergency` edges added to every step, 0 issues. Cancel and reschedule were folded into the staff handoff, not given their own paths; the reply said so and asked whether a callback is right. | Same shape: findings, intake split into four nodes, handoff and emergency edges on every step, 0 issues. Reply was a single weak sentence ("Validation passed with no issues…"). |
| 2 | `demo-sunrise-refills`: *Analyze runs* | The missing flow built after `confirm_refill`; a pharmacist handoff; an emergency exit; no invented policy (no turnaround time). | 3 findings (stall at the confirmation, chest pain not sent to emergency services, no way to reach a person), run ids cited, including r-2008 for the chest pain. Added `goodbye` (end), `handoff` (end) and `emergency` nodes with edges from every step; `confirm_refill` says the request was received and asks if there is anything else, with no time promised. 0 issues. | Added `goodbye`, `transfer_to_human` and `emergency` with the same edges, 0 issues, no time promised. |
| 3 | `demo-lakeside-billing`: *Analyze runs* | One edge changed: the handoff edge's description broadened; no nodes or edges added or removed. | One finding (r-3008); the handoff edge description broadened on two nodes; no node or edge added or removed; the reply said the other runs were left alone. | One finding (r-3008), the description broadened; no structural change; reply named the runs left alone. |
| 4 | `demo-riverside-scheduler`: *Ask Copilot* on flagged run r-1004, as `buildRunMessage` writes it (outcome, flag, transcript, `Path:`, then `What went wrong: the caller wanted to cancel and the agent kept offering to book.`) | An ordinary turn about that call: a way out of the greeting for cancelling, as a proposal. | Findings and a proposal: a staff handoff from the greeting, emergency exit, and the intake split; 0 issues. | Not run. |
| 5 | `demo-lakeside-billing`: `What do the production runs of the demo-sunrise-refills agent say? Summarize them.` | A refusal in one or two sentences; no steps, no findings, no proposal. | Declined: it only works on the open agent. No file read. | Declined the same way. |

The message in rows 1 to 3 is the one *Analyze runs* sends. The UI itself (Runs tab, canvas highlight, findings card, run links, Apply) is covered by Vitest and the Playwright spec with a stubbed stream, not by this script.

## Known issues

- Haiku folds "cancel" and "reschedule" into one staff handoff instead of building two paths, and asks in its reply whether that is acceptable. That is within the skill (policy unknown, hand off) but less than the table's ideal. A model that builds a self-service cancel path would need the scheduling policy, which the runs do not contain.
- Model output varies run to run: node names, how many edges are added to which steps, and the exact wording differ between runs. The checks above are about shape (findings before edits, run ids cited, the planted flaw fixed, unrelated paths kept, 0 issues), not exact text.
- Sonnet's scheduler reply was one sentence that did not say what changed. The proposal card and the findings card carry the content, so it was left as is.
- The UI flows were not clicked through against the real CLI in this run; they use a stubbed stream in the Playwright spec.

## Replay check with a real model (change 1, tasks 5.0 to 5.2)

Observed on 2026-10-30 with a real `OPENAI_API_KEY` (caller and judge on `gpt-4o-mini`; the agent side uses each agent's own model, which is `gpt-4o-mini` for the demo agents) and the default Haiku Copilot. Everything below is a single sample per run: the simulated caller, the judge and the Copilot all vary between runs. `make demo-check` needs `make demo` first and a key in `backend/.env`.

### What the real run changed

- **Turn limit 12 to 20.** With the split intake (one node per question) a working booking call needs about 8 agent turns on the happy path, and with 12 it hit the limit and was judged `stuck`, so the three booking calls showed as *Broken* on *after*. At 20 they are *kept*.
- **Caller prompt.** The caller used to replay its original lines in order ("No, I want to cancel the one I have", "Forget it"), which made every *after* call fail. It now answers what the new agent asks, may invent a name or date of birth it was never given, and, as the original caller did, gets lost when the agent asks several things in one message.
- **`replay.check`** passed the stored record (`{id, agent, updated_at}`) to the replay instead of the agent (`KeyError: 'name'`); fixed and covered by a test.

### Before: does each failure reproduce? (`make demo-check`)

Scheduler, three runs (the cancel run and the two four-question runs):

| Run | Original | Replay (before) | Goal met | Reproduced |
| --- | --- | --- | --- | --- |
| r-1004 cancel (flagged) | abandoned | abandoned | no | yes |
| r-1007 four questions (Tom Reyes) | stuck | completed | yes | no |
| r-1008 four questions (Priya Shah) | stuck | completed (second sample: abandoned, not met) | yes (second sample: no) | flaky |

### Before and after: Analyze runs and replay, in the UI

Riverside Clinic Scheduler (Analyze runs in the browser; the card said **Fixed 4 of 5 failing calls · 3 of 3 working calls still work · 1 not reproduced**):

| Run | Original | Before | After | Reason (after) |
| --- | --- | --- | --- | --- |
| r-1001 | completed | completed, met | completed, met | still books through the split intake |
| r-1002 | completed | completed, met | completed, met | same |
| r-1003 | completed | completed, met | completed, met | same |
| r-1004 cancel | abandoned | abandoned, not met | completed, met | cancelled through the new name, date of birth and confirm nodes |
| r-1005 reschedule | abandoned | transferred, not met | completed, met | moved through the new reschedule nodes |
| r-1006 cancel | abandoned | abandoned, not met | completed, met | same cancel path |
| r-1007 four questions | stuck | completed, met (not reproduced) | completed, met | n/a |
| r-1008 four questions | stuck | abandoned, not met | transferred, not met | caller could not give a full date of birth ("born in 1988") and asked for a person |
| r-1009 asked for a person | abandoned | stuck, not met | transferred, met | reached the front desk handoff |

Every failing run reproduced on *before* except r-1007. Cancel (r-1004 and r-1006), reschedule and the handoff are fixed on *after*; one four-question run (r-1008) is not fixed because the simulated caller will not invent a date of birth when it was given only a year.

One other demo agent each (one run each, proposal from the same *Analyze runs* message through `run_turn`):

| Agent and run | Original | Before | After | Note |
| --- | --- | --- | --- | --- |
| `demo-sunrise-refills` r-2008 (chest pain ignored) | abandoned | transferred, met (judge says the agent did not address the emergency, yet marks the goal met) | transferred, not met (agent sent the caller to emergency services) | The judge is inconsistent on emergency calls; *after* is the behaviour the fix intends, but the card would show *Broken*. |
| `demo-lakeside-billing` r-3008 (asked for a person) | abandoned | transferred, met (not reproduced) | transferred, met | The seeded agent already hands off on "a real person" in text; the voice failure does not reproduce. |

### Browser timings

Playwright against the real stack (API, Vite, real Copilot on Haiku, real OpenAI), Chromium 1440x900, clock started when the agent page opened.

| Path | Steps | Time |
| --- | --- | --- |
| Full: Runs tab, **Analyze runs**, wait for findings and proposal, replay card fills in, open r-1004 (draws the path on the proposal), **Apply** | click to proposal 62 to 78 s (Copilot), replay summary at 132 to 146 s (about 65 s of replay for 9 runs, before and after, 4 at a time) | about 2 min 15 s to 2 min 25 s, three runs |
| Short: open r-1004, **Replay this call** (fails), Add node `cancel_appointment` (ends the call, with a message), drag an edge from `greeting`, describe it, **Replay this call** again | first replay 5 to 8 s (once 35 s), second 5 s | 20 s to 48 s |

Both paths work as written. Findings: the first replay of r-1004 ends *Abandoned* or *Stuck*, goal not met; after the hand-made edge the call reaches the staff handoff ("I'll connect you to the front desk to cancel your appointment") and is judged *Transferred*, but **goal not met**, because the judge wants the cancellation confirmed. The demo line "passes" should read "reaches the handoff". The simulated reply times are the main variance, so run `make demo-check` first to warm up.

### Cost of this check

About 25 replay jobs for the scheduler three times (two UI runs plus the final one), 6 jobs for the other two agents and a handful for prompt checks: roughly 55 replays at about 15 small `gpt-4o-mini` calls each, plus three Copilot (Haiku) runs for the scheduler and one each for the other two agents.
