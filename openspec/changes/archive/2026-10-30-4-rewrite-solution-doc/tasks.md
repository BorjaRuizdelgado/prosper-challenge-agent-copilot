# Tasks

Do this change after changes 1–3 are implemented or dropped, so the document describes what shipped.

## 1. Inventory

- [x] 1.1 List which of changes 1–3 shipped (archived or with all tasks ticked) and which did not, and the reason for each that did not. Verify: the list is written at the top of the draft and matches `openspec list`.

## 2. Rewrite

- [x] 2.1 Write the TL;DR, *The problem* and *The idea* sections (proposal items 1–3). Verify: a reader who reads only these three sections can name the user, both workflows, and the Copilot's loop for each.
- [ ] 2.2 Write the *Demo walkthrough* as the exact click path (seed, the guidelines build or *Check coverage* on the scheduler, Runs tab, *Analyze runs*, the replay card, Apply, Save, test call), taken from the Demo sections of changes 1–3, with the short path for each in case of time pressure, with what to point at at each step. Verify: follow it once end to end on a fresh `make demo`; every step works as written.
- [x] 2.3 Write *Architecture* (one mermaid diagram with only the shipped components) and *Key decisions and trade-offs* (proposal item 6, each with the alternative considered). Verify: every component in the diagram exists in the repo, and every decision names an alternative.
- [x] 2.4 Write *Built / mocked / left out* (one table) and *Production path and next steps*. Unshipped parts of changes 1–3 go here with their reason. Verify: every row of the table is true of the repo as it stands.
- [x] 2.5 Shorten *How it was built* and fix the OpenSpec paths to `openspec/changes/archive/...` and `openspec/specs/`. Verify: every path named in `solution.md` exists (`grep` the backticked paths and `ls` them).

## 3. Links and README

- [x] 3.1 Remove or repoint every link to `docs/copilot-demo.md` and `docs/manual-call-test.md` in `README.md` and `solution.md`, and link the demo walkthrough from the README. Verify: `grep -rn "copilot-demo.md\|manual-call-test.md" README.md solution.md` returns nothing, and every `docs/` path named in either file exists.
