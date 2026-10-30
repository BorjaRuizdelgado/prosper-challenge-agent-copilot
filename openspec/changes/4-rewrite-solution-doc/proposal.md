# Proposal

## Why

`solution.md` is the written defence of the submission, and reviewers grade judgment and product sense. Today it reads as a build log in the order things were built: Phase 1 slices, then the Copilot, then runs, then the redesign. The argument (who the user is, which bottlenecks the Copilot removes, and why this design) has to be pieced together. It also has stale and broken parts:
- line 3 says the Copilot "will" generate agents;
- it points to `openspec/changes/add-agent-builder-frontend/`, which is now under `archive/`;
- "Extension points for the Copilot" is a Phase 1 leftover;
- it links `docs/copilot-demo.md` and `docs/manual-call-test.md`, which were deleted in `808e434` (`README.md` has the same dead links at lines 43, 69, 78 and 116).

This change is last on purpose, so the document describes what actually shipped in changes 1–3.

## What Changes

- Rewrite `solution.md` around the argument, in this order:
  1. **TL;DR**: five lines, covering the user, the two workflows, the Copilot's loop, and what to look at in the demo.
  2. **The problem**: the deployment team's two workflows and where the time goes (translating guidelines and chasing missing policy; finding problems in calls, fixing them and proving the fix).
  3. **The idea**: the Copilot works like a deployment engineer. *Requirements in → agent + questions for the client out. Calls in → findings → fix → replayed proof.* A human reviews a diff and applies. Why this is the right level of automation for healthcare.
  4. **Demo walkthrough**: the exact click path for the live demo, with what to point at at each step.
  5. **Architecture**: one diagram covering the editor, API, Copilot engine (Claude Code via the Agent SDK, draft file, guard, tools, skills), replay and the voice runner.
  6. **Key decisions and trade-offs**:
     - agent as one JSON document;
     - one validator;
     - Claude Code embedded rather than a raw API;
     - draft-file editing with validation in the loop;
     - review before apply;
     - evidence as files rather than chat;
     - findings and coverage as tool calls;
     - text replay rather than voice;
     - why Claude for the Copilot while the voice agent runs on OpenAI.
  7. **Built / mocked / left out, and why**: one table. It names every demo placeholder (mocked runs, run goals, sample guidelines and client reply, seeded scheduler guidelines) and what would replace it. It says plainly that automatic issue detection was left out: client flags still mark the bad calls, and the review groups and explains them. The argument: replaying calls to prove the fix was judged the higher-value use of the time, and per-call triage at ingestion is the first next step.
  8. **Production path and next steps**: per-call triage at ingestion with clustering; versions and deploy; the Copilot iterating against replay itself; real call capture; multi-tenant hosting of the engine (API key in a sandbox rather than the CLI login).
  9. **How it was built**: OpenSpec plus Claude Code, kept short, with the correct archive paths.
- Each section lists only what shipped. A change from 1–3 that was not implemented moves to *Left out* with its reason.
- Fix the dead links in `README.md` and `solution.md`: point them at docs that exist, or remove them.
- Keep the README as the how-to-run document. `solution.md` links to it instead of repeating setup.

## Capabilities

### New Capabilities
<!-- None: documentation only. -->

### Modified Capabilities
<!-- None: no behavior changes. The change sets skip_specs: true. -->

## Impact

- `solution.md` (rewritten) and `README.md` (dead links, and a pointer to the demo walkthrough).
- No code, API or behavior change.
