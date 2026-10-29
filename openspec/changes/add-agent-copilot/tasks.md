# Tasks

Each group is a vertical slice that ends with something usable and verified. Tests and docs land in the group that owns the work. Backend tests never call Claude: they use a fake runner behind the `run_turn` seam (design Decision 6). Real model behavior is checked manually against the spec scenarios.

## 1. Spike: Agent SDK on the subscription login

- [ ] 1.1 Add `claude-agent-sdk` via `uv add`; with a throwaway script and `ANTHROPIC_API_KEY` unset, run one SDK query with `cwd` set to a temp dir, `setting_sources=["project"]`, a custom `@tool`, `allowed_tools`, a `can_use_tool` callback and `resume`. Confirm it authenticates with the CLI login, the custom tool is called as `mcp__copilot__validate_agent`, `can_use_tool` sees file paths, and a project skill in `cwd/.claude/skills/` loads. Record any API differences in `design.md` Decisions 1, 3–5 and 7. Verify: script output committed in the notes; the dependency resolves in `uv.lock`.

## 2. Backend engine: draft, guard, validation tool, runner

- [ ] 2.1 Create `backend/copilot/` with workspace paths (`workspace/drafts/` git-ignored, `workspace/.claude/skills/prosper-blueprints/` committed) and `write_draft(agent_id, agent)` / `read_draft(agent_id)` using stable pretty-printing and the existing agent-id check. Verify: pytest round-trips an agent, rejects bad ids, and the draft file is byte-identical for equal input.
- [ ] 2.2 Implement the path guard (design Decision 3) as a pure function: allow read/write on the current agent's draft, read-only under the skill directory, deny everything else after resolving `..` and symlinks. Verify: pytest table covering the draft, the skill files, another agent's draft, `../agents/x.json`, absolute paths and a symlink out of the workspace.
- [ ] 2.3 Implement the `validate_agent` tool over `validation.validate`, formatting issues as one line each, "0 issues" when clean, and a parse error when the draft is not JSON. Verify: pytest on a clean draft, a dangling target and broken JSON.
- [ ] 2.4 Write the system prompt (Prosper "AI Agent Manager" persona, turn protocol: read, edit, validate, reply in at most three sentences, ask only for decisions that belong to the user, decline out-of-scope requests in one sentence). Verify: prompt file reviewed against the spec requirements *Clarify only when guidelines are ambiguous* and *Copilot can only change the agent*.
- [ ] 2.5 Implement `run_turn(agent_id, message, agent)` with the SDK: write the draft, resume the session, map SDK messages to `step` events (with `node` when a node is being read or edited) and token-level `text` events from partial messages, emit a `draft` event after each `Edit`/`Write` result when the draft parses and changed since the last one, read and validate the draft at the end, emit `proposal` only if it differs from the input, store the new session id; map a missing CLI or missing login to `error` with `setup: true`. Verify: pytest for the step-label and node-name helper and for the draft-event filter (unparseable or unchanged drafts are skipped); manual run of one turn from a script prints steps, text and a proposal.

## 3. Blueprints skill

- [ ] 3.1 Write `SKILL.md`: agent JSON contract, edge-as-tool semantics, `properties`/`required`, actions, `end`, naming rules the validator enforces, healthcare voice conventions (spoken style, one question at a time, no medical advice, emergency and human handoff, an end node), minimal-edit guidance, and the skeleton-first protocol for new agents (design Decision 8). Verify: every rule in the spec requirement *Generated agents follow healthcare voice conventions* appears in the skill.
- [ ] 3.2 Add `blueprints/scheduling.json`, `refills.json` and `billing-faq.json`, each following the conventions. Verify: a pytest runs each blueprint through `validation.validate` and expects no errors.

## 4. Copilot API

- [ ] 4.1 Add `POST /api/copilot/{agent_id}` (body `{message, agent}`, SSE response with the events in design Decision 6), `POST /api/copilot/{agent_id}/reset`, a per-agent lock returning 409 for a concurrent turn, interrupting the runner and releasing the lock when the client disconnects, and dependency injection of the runner. Verify: pytest with a fake runner covers the event sequence, a 409 on a concurrent turn, a disconnect mid-turn (runner interrupted, lock released), reset, an invalid agent id and a setup error.
- [ ] 4.2 Vite already proxies `/api`; confirm the SSE stream is not buffered through the proxy. Verify: `curl -N` through the Vite port shows events arriving one by one during a real turn.

## 5. Copilot tab: chat and streaming

- [ ] 5.1 Frontend client `streamCopilot(agentId, message, agent)` that parses SSE from a `fetch` reader into typed events, plus `resetCopilot`. Verify: Vitest feeds chunked SSE text (events split across chunks) and gets the expected events.
- [ ] 5.2 `copilotStore` keyed by agent id: messages, live steps, running flag, proposals with their base working copy, errors. Verify: Vitest for send, stream accumulation, error and reset.
- [ ] 5.3 `CopilotPanel` registered in `DOCK_TABS`: empty state with example requests, message list with step lines and reply text typing out, a client-side working indicator with a running timer shown on send, Stop (aborts the stream), input disabled while running, New chat, setup error message naming the Claude login and `ANTHROPIC_API_KEY`. Verify: Vitest with a fake stream covers the empty state, the indicator appearing before any event, streaming steps, Stop, disabled input and the setup message; manual check in the browser.
- [ ] 5.4 Live canvas focus: `step.node` sets a `copilotFocus` node that the canvas outlines with a pulse (same render path as the call's active node), cleared at the end of the turn. Verify: Vitest that a step with `node` sets focus and `done` clears it; manual check that the pulse follows the copilot's edits.

## 6. Proposal review: diff, apply, discard

- [ ] 6.1 `diffAgents(before, after)`: added, removed and changed nodes (by field) and edges (by `node/function`). Verify: Vitest for add, remove, change of task text, retarget and property change; identical agents give an empty diff.
- [ ] 6.2 Proposal card in the panel: summary counts, a collapsed Changes list with expandable before/after text, remaining issues, Apply and Discard. Apply confirms when the working copy changed since the proposal's base, then calls `replaceAgent` and drops layout entries for removed nodes; Discard marks the card discarded. Verify: Vitest for apply (store dirty, agent replaced), discard (store untouched) and the stale confirmation; manual check that the canvas lays out new nodes.
- [ ] 6.3 Live canvas draft: from the first `draft` event the canvas renders the draft (re-rendering on each one) with nodes and edges tagged added / changed / removed (removed drawn faded from the base), added nodes fading in and changed ones flashing, base positions reused by name, editing disabled, Inspector read-only on selection, and a banner ("Copilot draft" while running; Apply / Discard / Hide at the end). Verify: Vitest that tags match `diffAgents`, that existing node positions do not change across drafts, that the working copy and dirty flag are unchanged, and that Hide/Discard restore the working copy; manual check that a guidelines build grows node by node.

## 7. Fix from call

- [ ] 7.1 "Ask Copilot" in the Call tab after a call ends with a transcript: build the message (transcript lines, `Path: a -> b -> c` from transition notes, a trailing `What went wrong: `), open the Copilot tab with it in the input and the cursor at the end. Verify: Vitest for the message builder and that the button is hidden with an empty transcript; manual check after a real call.

## 8. End-to-end checks and docs

- [ ] 8.1 Manual demo script against the spec scenarios: build a refill agent from pasted guidelines, a targeted edit, an ambiguous request (expect a question), an out-of-scope request (expect a refusal), Apply then Save then test call, Ask Copilot from that call and apply the fix. Verify: each scenario observed; failures fixed in the prompt or skill, or recorded as known issues.
- [ ] 8.2 Docs: `solution.md` Phase 2 section (architecture diagram, why Claude Code embedded, draft + validate loop, review-before-apply, Blueprints, fix from call, what was left out and why) and README setup (logged-in `claude` CLI or `ANTHROPIC_API_KEY`, keep the key unset to use the subscription). Verify: following the README on a clean checkout reaches a working copilot turn.
- [ ] 8.3 Extend the Playwright smoke spec with the Copilot tab using a stubbed `/api/copilot` route: send, see steps, apply a proposal, see the new node on the canvas. Verify: `npm run e2e` passes.

## Workflow follow-up

- Archive the change after review, syncing `agent-copilot` and the `test-call` delta into `openspec/specs/`.
- Next change candidates: flagged-calls inbox with mocked production calls, automatic issue detection over transcripts, simulated-caller regression of a fix.
