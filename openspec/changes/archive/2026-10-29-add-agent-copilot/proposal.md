# Proposal

## Why

Prosper's deployment team turns a client's natural-language guidelines into an agent graph by hand, and then fixes agents by hand when a call goes wrong. Phase 1 gave them an editor; Phase 2 should do the typing for them. The editor, the agent JSON contract and the validator already exist, so the copilot can read and write the same document a human edits, the way Claude Code edits source files.

## What Changes

- Add an **Agent Copilot** tab to the editor dock: a chat where the user describes what the agent should do ("Build a refill line for a pharmacy; transfer to a pharmacist on drug interaction questions") or what to change ("Ask for date of birth before the reason for visit").
- Back the copilot with **Claude Code embedded in the API** (the Claude Agent SDK). It runs on the developer's local Claude Code login by default, so no per-token billing; `ANTHROPIC_API_KEY` is used if set.
- The copilot works on a **draft copy** of the editor's current working copy (unsaved edits included). It can only read and edit that draft and call a `validate_agent` tool backed by the existing validator, so it fixes its own validation errors before replying. It cannot run commands or touch other files.
- The user sees a **proposed change**: a short summary plus a node/edge-level diff (added, removed, changed). **Apply** loads it into the editor as unsaved edits (normal Save flow); **Discard** drops it. The copilot never saves an agent.
- Replies stream: the user sees steps ("Reading agent", "Editing offer_times", "Validating: 0 issues") while the copilot works.
- A **Prosper Blueprints skill** teaches the copilot the agent JSON through worked examples (scheduling, prescription refills, billing FAQ) and bakes in healthcare voice conventions: spoken-only replies, one question at a time, no medical advice, an escalation path for emergencies and humans.
- The copilot's persona follows Prosper's "AI Agent Manager": confident and terse. It acts first, summarizes the change in two or three sentences, and asks a question only when the guidelines are genuinely ambiguous.
- **Fix from call** (small, first step of the production-iteration workflow): after a test call, the Call tab offers "Ask Copilot", which opens the copilot with the transcript and the node path prefilled, so the user only adds what went wrong.

Out of scope for this change (follow-ups): a mocked inbox of flagged production calls, automatic issue detection over call data, and a simulated caller that regression-tests a fix.

## Capabilities

### New Capabilities
- `agent-copilot`: Conversational assistant in the editor that proposes validated changes to the open agent from natural-language instructions or a test-call transcript, and lets the user apply or discard them.

### Modified Capabilities
- `test-call`: After a call ends, the Call tab offers to send the transcript and node path to the copilot.

## Impact

- **Backend**: new `copilot` package and `POST /api/copilot/{agent_id}` streaming endpoint (plus a reset endpoint); new dependency `claude-agent-sdk`; a copilot workspace directory with the Blueprints skill (committed) and per-agent drafts (git-ignored).
- **Runtime requirement**: the `claude` CLI installed and logged in, or `ANTHROPIC_API_KEY` set. Without either, the copilot tab shows a setup message; the rest of the editor is unaffected.
- **Frontend**: new Copilot dock tab, a streaming client, a pure agent-diff function, and an "Ask Copilot" action in the Call tab. Applying uses the existing `replaceAgent` store action, so dirty tracking, validation and Save are unchanged.
- **Docs**: `solution.md` Phase 2 section and README setup note.
