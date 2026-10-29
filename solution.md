# Overview of the Solution

An agent is a graph of nodes (Pipecat Flows) stored as a JSON document. The editor edits that JSON, the API stores and validates it, and the provided voice runner compiles it with `AgentBuilder` and runs it. Phase 2 (the Copilot) will generate and modify the same JSON.

## Architecture

```mermaid
flowchart LR
    UI["Editor UI<br/>frontend/"]
    API["Agents API<br/>backend/api · :8000"]
    Files[("backend/agents/*.json")]
    Runner["Voice runner (provided)<br/>bot.py + AgentBuilder · :7860"]

    UI -- "REST /api/agents" --> API
    API --> Files
    Runner -- "load by agent_id" --> Files
    UI -- "WebRTC call with agent_id" --> Runner
    Runner -- "RTVI: transcript, node_changed" --> UI

    classDef provided stroke-dasharray: 5 5
    class Runner provided
```

The voice runner (Pipecat pipeline, ElevenLabs STT/TTS, OpenAI LLM, Pipecat Flows, `AgentBuilder`) was provided and is used as is, apart from the small hooks listed below. The work in this repo is the editor UI, the agents API, and the glue between them and the runner.

### Components

- **Editor UI** (`frontend/`, Vite + React + TypeScript). Agent list, graph canvas (React Flow, dagre auto-layout) and a dock with Inspector, Issues, JSON, Settings and Call tabs. All edits go through actions on one Zustand store that holds the working copy of the agent. A separate call store holds the call state, transcript and active node.
- **Agents API** (`backend/api/`, FastAPI). CRUD on `/api/agents` plus `POST /api/agents/validate`. Agents are files in `backend/agents/<id>.json`, seeded from `example_flow.json`.
- **Voice runner** (`backend/bot.py`, provided). Started by the Call tab with `{agent_id}` in the session body; loads that agent and runs it.

### Decisions

- **Files, not a database.** Single-user local tool. Writes are atomic (temp file + rename), so a failed save leaves the previous version. Ids must be a lowercase slug, so a path cannot escape the directory.
- **One validator.** Rules live in one Python function used by the runner and the API. The UI does not reimplement them; it debounces calls to `/validate` and renders the result. Two small UI-side checks exist only for immediate feedback: the JSON tab refuses documents the canvas cannot draw, and the edge form refuses invalid function names as you type.
- **Layout in the agent JSON.** Positions travel with the agent (duplicate, export, Copilot edits). Nodes without a position are auto-laid out.

## How it was built

The implementation was done with Claude Code, driven by an [OpenSpec](https://github.com/Fission-AI/OpenSpec) change instead of free-form prompts. The spec is in `openspec/changes/add-agent-builder-frontend/`:

| File | Contents |
| --- | --- |
| `proposal.md` | Why the change is needed and what it adds (frontend, agents API, validation, `agent_id` per call). |
| `design.md` | Goals, non-goals, decisions (libraries, storage, validation codes, Pipecat runner contract) and trade-offs. |
| `specs/*/spec.md` | 17 requirements with scenarios across 4 capabilities: agent management, graph editor, agent configuration, test call. |
| `tasks.md` | 30 tasks in 9 vertical slices. Each task names its verification step (a test or a manual check in the browser). |

The process:

1. Give the Phase 1 requirements to the `openspec-propose` skill (`.claude/skills/`), which produced the proposal, design, specs and tasks. Review and edit them before any code.
2. Use the `openspec-apply-change` skill to have the agent implement `tasks.md` one task at a time, run the task's verification, tick the checkbox and commit with the task number (e.g. `(task 1.2)`).
3. When something did not hold (e.g. task 1.1, the live stub-bot check could not run locally), update the spec or leave the task open rather than diverge from it silently.

The spec is the source of truth for scope: anything not in `tasks.md` was not built, and the "left out" list below matches the design's non-goals.

## Phase 1: the agent builder

Delivered as stacked PRs, one per slice in `tasks.md`:

| Slice | Contents |
| --- | --- |
| Skeleton | FastAPI app, Vite/React shell, agent list with loading / empty / error states, `make dev` / `make up`. |
| Agent management | Create, rename, duplicate, delete with confirmation, toasts. |
| Read-only graph | Typed model, API client, store, auto layout, node cards, labelled edges, fit-to-view, minimap. |
| Node editing | Inspector form (name with rename cascade, task messages, role override, pre/post actions as Say / End call steps), save with dirty tracking, Cmd/Ctrl+S, unsaved-changes guard. |
| Edge editing | Connect, retarget and delete edges by dragging; edge form for function, description and collected parameters; draggable labels. |
| Structure and layout | Add / delete node, set initial node, persisted positions, auto layout. |
| Settings, validation, JSON | Persona / voice / model settings; server validation with clickable issues and canvas markers; raw JSON view with *Apply*. |
| Test call | Mic permission, connect, mute, hang up; live transcript with transitions; active node and last edge highlighted on the canvas. |
| Polish | Fit-to-view zoom cap, agent list hover fix, Playwright smoke spec, docs. |

### Extension points for the Copilot

- **Agent JSON contract** (`agent_builder/schema.py`, `frontend/src/model.ts`): the Copilot reads and writes the same document as the editor and the runner. Nodes without a `layout` position are auto-laid out, so generated agents need no coordinates.
- **Validation** (`POST /api/agents/validate`): structured issues with node and edge locations, so generated or edited agents can be checked and fixed in a loop before a human sees them.
- **Store actions** (`frontend/src/store.ts`): `replaceAgent`, `updateNode`, `addEdge`, `renameNode`... apply changes with the same cascades and dirty tracking as manual edits.
- **Dock registry** (`frontend/src/components/Dock.tsx`): a Copilot panel is one more registered tab next to Inspector, Issues, JSON, Settings and Call.
- **Call events** (`node_changed` RTVI messages, transcript in `frontend/src/call/callStore.ts`): which nodes a call went through and what was said, the raw material for spotting issues in calls.

## Phase 2: the Agent Copilot

A chat tab in the editor that turns natural language into validated changes to the open agent: build one from pasted call guidelines, make a targeted edit, or fix an agent after a test call. The user reviews a diff on the canvas and presses Apply; nothing is saved without the normal Save.

```mermaid
flowchart LR
    Panel["Copilot tab + canvas<br/>frontend/src/copilot"]
    Endpoint["POST /api/copilot/{id}<br/>SSE · backend/api/copilot.py"]
    Runner["run_turn<br/>Claude Agent SDK"]
    CLI["claude CLI<br/>(login or API key)"]
    Draft[("workspace/drafts/{id}.json")]
    Skill[("prosper-blueprints skill<br/>SKILL.md + 3 blueprints")]
    Validate["validate_agent tool<br/>= validation.validate"]

    Panel -- "message + working copy" --> Endpoint
    Endpoint --> Runner
    Runner --> CLI
    CLI -- "Read / Edit / Write" --> Draft
    CLI -- "read-only" --> Skill
    CLI -- "after the last edit" --> Validate
    Validate --> Draft
    Runner -- "step · text · draft · proposal" --> Panel
```

### Why Claude Code, embedded

An agent graph is a JSON document, and "read the file, make small edits, run the checker, fix what it reports" is exactly what Claude Code does with source files. Embedding it through the Claude Agent SDK gives file editing, sessions with memory per agent and a tool loop for free, instead of rebuilding them on a raw API. It also runs on the developer's Claude login, so the challenge needs no extra key. `ANTHROPIC_API_KEY` is the fallback; leave it unset to use the subscription.

### The draft and validate loop

Each turn the API writes the editor's working copy (unsaved edits included) to a draft file, with stable key order so string edits match reliably. The model may only read and edit that file and read the skill; a path guard resolves `..` and symlinks and denies the rest, and Bash, web and sub-agent tools are not allowed. It must call `validate_agent`, the same validator behind the Issues tab and the voice runner, after its last edit and fix what it reports before answering. The draft is overwritten every turn, so a discarded proposal never leaks into the next one. Edits are small by construction (`Edit` on one node), which keeps the diff reviewable.

### Review before apply

Each `Edit`/`Write` that leaves a parseable, changed draft produces a `draft` event. The canvas renders it live: added nodes and edges green, changed amber, removed faded and dashed, existing positions untouched, canvas read-only, the node being edited pulsing. For a new agent the skill requires a skeleton `Write` first and per-node `Edit`s after, so the graph grows node by node instead of appearing at once. At the end a proposal card lists counts and a collapsed per-field Changes list, with Apply, Discard and Hide. Apply loads the proposal as unsaved edits (it asks first if the working copy changed meanwhile). The model never saves.

Progress is never silent: the working timer appears on send before any server round trip, steps stream as one line each, and Stop aborts the fetch, which makes the server interrupt Claude Code and free the agent's lock.

### Blueprints and voice conventions

The `prosper-blueprints` skill holds the JSON contract (edges are LLM tools, `properties`/`required`, actions, `end`, the validator's naming rules), healthcare voice conventions (spoken sentences, one question at a time, no medical advice, an emergency exit, a human handoff, an end node) and three complete agents (scheduling, refills, billing FAQ) that a test runs through the validator. Conventions are added even when the guidelines do not mention them. The system prompt carries the persona (terse "AI Agent Manager"), the turn protocol and when to ask.

### Fix from a call

After a call, *Ask Copilot* prefills the input with the transcript, the node path and `What went wrong: `. The copilot treats it like any instruction. This is deliberately only a prefilled message: it reuses the whole engine and review flow with no new pipeline.

### Testing

Backend tests never call Claude: a scripted fake SDK client covers event mapping, a fake runner covers the endpoint (409, disconnect, reset, setup error), and pure functions cover the guard, step labels and draft filter. Vitest covers the SSE parser, store, panel, diff, proposal card, live review and Ask Copilot. The Playwright spec stubs `/api/copilot` with a canned stream to cover send, steps, review, Apply and the new node on the canvas. Real behaviour was exercised against the Claude CLI with `docs/copilot-demo.md`, which also records what that run changed in the prompt and skill (clarify on vague requests, keep replies to three sentences, skeleton-only first write).

### Left out, and why

- **The real voice call in the demo run.** It needs OpenAI and ElevenLabs keys and a microphone; fix-from-call was replayed with a synthetic transcript instead.
- **Persisted conversations.** Sessions live in API memory; a restart starts fresh. Acceptable for a local single-user tool.
- **Flagged-calls inbox, automatic issue detection, simulated-caller regression.** Natural next steps on the same engine; out of scope for this change.
- **Rename detection in the diff.** A renamed node shows as one removed and one added.
- **Text appears at the end of a turn.** The reply is written after the tool calls, so progress is carried by steps and the live canvas rather than typing.
