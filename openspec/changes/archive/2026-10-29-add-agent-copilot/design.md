# Design

## Context

See proposal.md for motivation. What exists today:

- The agent is one JSON document (`agent_builder/schema.py`, `frontend/src/model.ts`) shared by the editor, the API and the voice runner. Nodes without a `layout` entry are auto-laid out.
- `agent_builder/validation.py` returns structured issues (code, message, node, edge) and is exposed as `POST /api/agents/validate`.
- The frontend keeps one working copy in a Zustand store; `replaceAgent` swaps it with dirty tracking. The dock is a registry (`DOCK_TABS` in `Dock.tsx`).
- `callStore` keeps the transcript (user, agent and transition-note entries) after a call ends.
- The API is a local, single-user FastAPI app with file storage under `backend/agents/`.
- The developer has the `claude` CLI installed and logged in with a subscription. The challenge only provides OpenAI and ElevenLabs keys.

## Goals / Non-Goals

**Goals:**
- One copilot engine that serves both "build from guidelines" and "fix from a call"; the difference is only the message.
- The copilot edits the document, checks it with the real validator, and fixes it before the user sees it.
- Every change goes through human review (diff, then Apply) and the existing Save flow.
- Runs on a Claude Code subscription with no per-token billing.

**Non-Goals:**
- Multi-user sessions, persistence of conversations across API restarts, or concurrent turns on one agent.
- Copilot-initiated saves, test calls, or changes to agents other than the open one.
- Flagged-call inbox, automatic issue detection over call data, simulated-caller regression tests (follow-ups).
- Changing the agent JSON format or the validator.

## Decisions

### 1. Embed Claude Code through the Claude Agent SDK (Python)

The copilot is a Claude Agent SDK session (`claude-agent-sdk`) run inside the API process. The SDK drives the locally installed `claude` CLI, so auth is whatever the CLI uses: the subscription login by default, or `ANTHROPIC_API_KEY` if set in the environment.

- *Alternative: raw Messages API with our own tool loop.* About the same code, but we would rebuild file editing, multi-turn sessions and the tool loop, and it bills per token.
- *Alternative: `claude -p --output-format stream-json` in a subprocess.* Same auth and capabilities, but we would parse the stream and wire custom tools through an external MCP server. The SDK gives typed messages and in-process tools.
- *Alternative: OpenAI with the provided key.* No Claude Code harness; we would write the agent loop ourselves. Rejected for the same reasons as the raw API.

The API's `.env` must not set `ANTHROPIC_API_KEY` unless per-token billing is intended; the README states this.

*Spike (task 1.1, `claude-agent-sdk` 0.2.174, CLI 2.1.308):* with `ANTHROPIC_API_KEY` unset, `ClaudeSDKClient` authenticated through the CLI login with no extra setup. Drive it with `ClaudeSDKClient` (`query` + `receive_response`); `ResultMessage.session_id` carries the session id.

### 2. The copilot edits a draft file, not the editor state

Each agent gets a workspace file `backend/copilot/workspace/drafts/<agent_id>.json`. At the start of each turn the API writes the request's working copy there (pretty-printed, stable key order, so `Edit` string matching is reliable). The copilot uses `Read`/`Edit`/`Write` on that file. When the turn ends, the API reads the file back, validates it and returns it as the proposal.

- Gives Claude Code its native way of working (read the file, make targeted string edits), which keeps changes small and reviewable.
- The draft is overwritten every turn, so a discarded proposal never leaks into the next turn, and unsaved editor edits are always the starting point (spec: *Copilot works on the current working copy*).
- *Alternative: the model returns the whole JSON each turn.* Simpler, but the model regenerates untouched nodes on every turn (drift, cost, latency) and there is nothing to self-validate against mid-turn.

### 3. Sandboxing: tool allowlist plus a path guard

- `allowed_tools`: `Read`, `Edit`, `Write`, `Skill`, and the custom `mcp__copilot__validate_agent`. Everything else (Bash, WebFetch, Task, etc.) is disallowed explicitly.
- A path guard denies `Read`/`Edit`/`Write` whose resolved path is not the current agent's draft or a file under the skill directory (read-only). Denials return a message the model sees.
- *Spike correction:* `can_use_tool` is **not** a complete gate. (a) Any tool listed in `allowed_tools` is auto-approved before the callback (the SDK warns `CanUseToolShadowedWarning`), so `Read`/`Edit`/`Write` must not be in `allowed_tools`. (b) Even then, `Read` inside `cwd` is auto-approved and never reached the callback; only `Write` did. The guard therefore runs in a `PreToolUse` hook (`HookMatcher(matcher="Read|Edit|Write", hooks=[...])`), which saw both `Read` and `Write` with `tool_input["file_path"]` (absolute, `/private/var/...` form on macOS, so resolve before comparing). Denying from the hook is the enforcement point; `can_use_tool` stays as a second layer. `allowed_tools` holds only `Skill` and `mcp__copilot__validate_agent`.
- `cwd` is the workspace directory, and `setting_sources=["project"]` so only the workspace's `.claude/` is loaded, not the repo's or the user's settings, CLAUDE.md or skills.

The path guard is a pure function with unit tests; it carries the spec *Copilot can only change the agent*.

### 4. `validate_agent` as an in-process tool

Defined with the SDK's `@tool` and `create_sdk_mcp_server`. It takes no arguments, reads the current draft, runs `validation.validate` and returns the issues as text (`error E_DANGLING_TARGET at node offer_times edge select_time: ...`) or "0 issues". The system prompt requires calling it after the last edit and fixing errors before replying.

*Spike:* `@tool(name, description, input_schema)` with `{}` for no arguments, registered via `create_sdk_mcp_server(name="copilot", ...)` and `mcp_servers={"copilot": server}`, is called as `mcp__copilot__validate_agent` and works as designed. The CLI first issues a `ToolSearch` for it (`select:mcp__copilot__validate_agent`) before the call, which adds a step; ignore `ToolSearch` blocks when mapping steps to labels. If the draft is not valid JSON, the tool reports that as an error. The model gets the same feedback a human sees in the Issues tab.

### 5. Knowledge: a Prosper Blueprints skill plus a short system prompt

`backend/copilot/workspace/.claude/skills/prosper-blueprints/` (committed):
- `SKILL.md`: the agent JSON contract (fields, edge-as-tool semantics, `properties`/`required`, `pre_actions`/`post_actions`, `end`), naming rules from the validator, healthcare voice conventions (spoken style, one question at a time, no medical advice, emergency and human handoff, an end node), and how to keep edits minimal.
- `blueprints/scheduling.json`, `refills.json`, `billing-faq.json`: complete, valid example agents, checked by a backend test that runs them through the validator.

The system prompt holds the persona and the turn protocol (read the draft, load the skill for structural work, edit, validate, reply in at most three sentences, ask instead of editing only when a decision belongs to the user). The SDK's default Claude Code system prompt is replaced, not appended to, so the persona stays terse and does not drift into coding-assistant behavior.

- *Spike:* a skill at `cwd/.claude/skills/<name>/SKILL.md` (frontmatter `name`, `description`) loaded with `setting_sources=["project"]`; the model called `Skill {skill: "prosper-blueprints"}` and quoted its content, and it still remembered it after `resume`. The fallback below was not needed.
- *Alternative: inline everything in the system prompt.* Deterministic, but large on every turn and hides the "skill" design. Fallback if skill loading proves unreliable: the system prompt tells the model to `Read` `SKILL.md`, which the path guard allows.

### 6. Streaming protocol: SSE over a POST

`POST /api/copilot/{agent_id}` with body `{message, agent}` returns `text/event-stream`:

| event | data |
| --- | --- |
| `step` | `{label, node?}`: "Reading agent", "Editing offer_times" (`node: "offer_times"`), "Validating: 0 issues" |
| `text` | `{delta}`: reply text, token by token |
| `draft` | `{agent}`: the draft after an `Edit`/`Write`, only when it parses and differs from the last `draft` sent |
| `proposal` | `{agent, issues}`: only if the draft differs from the working copy sent |
| `done` | `{}` |
| `error` | `{message, setup?: true}` |

Step labels are derived on the server from tool-use blocks (Edit: find the node name around `old_string`; fall back to "Editing agent"). Text deltas come from the SDK's partial-message stream (`include_partial_messages`), so the reply types out instead of arriving in one block. The frontend reads the stream with `fetch` and a `ReadableStream` reader, since `EventSource` cannot POST. `POST /api/copilot/{agent_id}/reset` clears the session.

**Never leave the user hanging.** Several seconds per turn is unavoidable (CLI start, model latency), so every second must show something:

```
 t=0      send       -> client shows "Working" + running timer (no server round trip)
 t~1-3s   step       -> "Reading agent"; canvas pulses the node in step.node
 t~3-15s  draft      -> canvas switches to the draft and updates after every edit
          step/text  -> one line per edit and validation; reply types out
 end      proposal   -> banner: Apply / Discard / Hide; Changes list collapsed in the panel
```

- The working indicator and timer are client-side and appear on send, before the server responds.
- Stop aborts the `fetch`; the server detects the disconnect and calls the SDK client's `interrupt()`, then releases the agent lock.
- `step.node` feeds a `copilotFocus` value that the canvas renders as a pulsing outline, using the same mechanism as the active node during a test call.
- `draft` events (Decision 8) make the canvas itself show progress: the graph changes while the copilot works, not after.

The SDK call sits behind a `run_turn(...) -> AsyncIterator[Event]` seam so endpoint tests use a fake runner and need no Claude login. `run_turn` also takes a `client_factory` (default `ClaudeSDKClient`), so the message-to-event mapping is tested with a scripted fake client.

*Task 2.5 manual run* (real CLI login, `example_flow.json`, "add a goodbye sentence to the end node"): events arrived as `step` (Reading agent), `step` (Editing confirm, `node: confirm`), `draft`, `step` (Validating: 0 issues), `text`, `proposal`, `done`. Because the reply comes after the tool calls, `text` deltas arrive at the end of a turn; the steps carry the progress before that.

*Task 4.2 proxy check* (`curl -N` through the Vite dev server, real CLI login, same edit as above): events reached the client as they were produced, not at the end (`step` at +0s, `step`/`draft`/`step` about 5s later, `text` deltas about 4s after that, then `proposal` and `done`). Vite's proxy needs no change; the endpoint sets `Cache-Control: no-cache` and `X-Accel-Buffering: no` for proxies that would buffer.

### 7. Sessions: in-memory map of agent id to SDK session id

On each turn the runner resumes the stored session id for that agent, and stores the new one from the result message. A per-agent `asyncio.Lock` rejects a second concurrent turn with 409. Restarting the API forgets conversations; acceptable for a local tool.

*Spike:* `ClaudeAgentOptions(resume=<session_id>)` on a new `ClaudeSDKClient` kept context across turns (the second turn recalled the skill content). The session id returned by the resumed turn was the same as the original, so storing it after every turn is safe.

### 8. Proposal review in the frontend

- `diffAgents(before, after)` is a pure function that returns added, removed and changed nodes (by name, and by changed field: task text, role, actions, end) and edges (by `node/function`: description, target, properties). Renames show as one removed plus one added node; good enough and honest. Unit-tested.
- The panel keeps the working copy the proposal was based on. Apply compares it with the current working copy and confirms if they differ (spec: *Stale proposal*), then calls `replaceAgent(proposal.agent)`. Layout entries for removed nodes are dropped; new nodes get auto-layout.
- **The canvas is the review surface; the diff is secondary.** From the first `draft` event the canvas renders the draft instead of the working copy, re-rendering on every `draft`. Each node and edge is tagged `added`, `changed`, `removed` or unchanged by `diffAgents(base, draft)`; removed items come from the base and are drawn faded; newly added nodes fade in and changed ones flash once. The node in `step.node` pulses. This is a read-only render mode: selecting a node or edge opens the Inspector read-only, so the user inspects the proposal where they would edit it. A banner shows "Copilot draft" while running and "Proposal: Apply / Discard / Hide" at the end. The working copy and dirty flag are untouched until Apply. The Changes list in the panel (collapsed) is for reading exact before/after text.
- **Layout stability.** Draft nodes reuse the base's positions by name; only nodes without one are laid out (the existing layout already respects saved positions). Otherwise every edit would reshuffle the graph.
- **Intermediate drafts.** An `Edit` can leave the file momentarily invalid (rare with whole-value string edits); the server skips `draft` events that do not parse and sends the next one that does.
- **Skeleton first for new agents.** One `Write` of a whole agent would make the graph appear in one jump. The skill tells the copilot, when building from guidelines, to `Write` a skeleton (node names, edges with targets, one-line task stubs), then fill each node with `Edit`s. The graph appears early and fills in node by node. It costs a few extra tool calls, which buys visible progress.
- Copilot chat state lives in its own small Zustand store (`copilotStore`) keyed by agent id, like `callStore`, so switching tabs keeps the conversation.

### 9. Fix from call is a prefilled message, not a new pipeline

"Ask Copilot" in the Call tab builds a message from `callStore.transcript`: user and agent lines, plus transition notes turned into a node path line (`Path: greeting -> collect_details -> offer_times`). It opens the Copilot tab with that text in the input and a final line `What went wrong: ` for the user to fill in. The copilot handles it like any other instruction. This keeps the first slice of workflow 2 trivial and leaves the inbox and auto-detection for a follow-up that reuses the same engine.

## Risks / Trade-offs

- [Turn latency of several seconds] → Stream steps and text so the user sees progress; prefer the CLI's default fast model, overridable with `COPILOT_MODEL`.
- [Subscription rate limits during a demo] → Note in the README; `ANTHROPIC_API_KEY` is a drop-in fallback.
- [The model edits the JSON into invalid syntax] → `validate_agent` reports parse errors, and the protocol requires a clean validation before replying. If the final draft still does not parse, the turn emits `error` with no proposal and the editor is untouched.
- [Edit string matching on large JSON] → Stable pretty-printing; `Write` is allowed for full rewrites (building a new agent from guidelines).
- [Path guard bypass via symlinks or `..`] → Resolve paths before comparing; drafts are written by the API only; tests cover `..`, absolute paths elsewhere and symlinks.
- [Copilot ignores the persona or asks too often] → Persona and protocol in the system prompt, with examples in the skill; checked manually against the spec scenarios in tasks.
- [Policy on subscription login use] → This is a local, single-user developer tool run by the subscriber; nothing ships the login to third parties. `ANTHROPIC_API_KEY` support covers any other setup.

## Migration Plan

Additive. New dependency (`uv add claude-agent-sdk`), new endpoints, new tab. Rollback is removing the tab registration and the router. Drafts are git-ignored scratch files.
