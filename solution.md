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

### Changes to the provided backend

| Change | Why |
| --- | --- |
| `agent_builder/validation.py` | Returns structured issues (code, severity, node, edge) instead of raising on the first problem. `AgentBuilder` now calls it and refuses to build on any error; the API exposes the same function, so the UI and the runner apply the same rules. |
| `on_transition` callback in `AgentBuilder` | Lets `bot.py` send a `node_changed` RTVI message on every edge taken, so the UI can highlight the active node during a call. |
| `layout` field in `AgentConfig` | Stores node positions in the agent JSON. Ignored at runtime. |
| `session.py` | Picks the agent from `agent_id` in the session body (was a hard-coded `example_flow.json`), checks API keys and blocking issues before the call starts. |

### Decisions

- **Files, not a database.** Single-user local tool. Writes are atomic (temp file + rename), so a failed save leaves the previous version. Ids must be a lowercase slug, so a path cannot escape the directory.
- **One validator.** Rules live in one Python function used by the runner and the API. The UI does not reimplement them; it debounces calls to `/validate` and renders the result.
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
| Node editing | Inspector form (name with rename cascade, task messages, role override, pre/post actions), save with dirty tracking, Cmd/Ctrl+S, unsaved-changes guard. |
| Edge editing | Connect, retarget and delete edges by dragging; edge form for function, description and collected parameters; draggable labels. |
| Structure and layout | Add / delete node, set initial node, persisted positions, auto layout. |
| Settings, validation, JSON | Persona / voice / model settings; server validation with clickable issues and canvas markers; raw JSON view with *Apply*. |
| Test call | Mic permission, connect, mute, hang up; live transcript with transitions; active node and last edge highlighted on the canvas. |
| Polish | Fit-to-view zoom cap, agent list hover fix, Playwright smoke spec, docs. |

## Phase 2

Agent Copilot. Not started.
