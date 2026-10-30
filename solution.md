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

- **Editor UI** (`frontend/`, Vite + React + TypeScript). A home page listing the agents and an editor with a top bar (agent switcher, Build / Test call / Runs tabs, Save), the Copilot panel on the left, the graph canvas (React Flow, dagre auto-layout top to bottom, with a Graph / JSON switch) and one panel on the right that belongs to the current tab. All edits go through actions on one Zustand store that holds the working copy of the agent. A separate call store holds the call state, transcript and active node.
- **Agents API** (`backend/api/`, FastAPI). CRUD on `/api/agents` plus `POST /api/agents/validate`. Agents are files in `backend/agents/<id>.json`, seeded from `example_flow.json`.
- **Voice runner** (`backend/bot.py`, provided). Started by the Test call tab with `{agent_id}` in the session body; loads that agent and runs it.

### Decisions

- **Files, not a database.** Single-user local tool. Writes are atomic (temp file + rename), so a failed save leaves the previous version. Ids must be a lowercase slug, so a path cannot escape the directory.
- **One validator.** Rules live in one Python function used by the runner and the API. The UI does not reimplement them; it debounces calls to `/validate` and renders the result. Two small UI-side checks exist only for immediate feedback: the JSON view refuses documents the canvas cannot draw, and the edge form refuses invalid function names as you type.
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
- **Dock registry** (`frontend/src/components/Dock.tsx`): a Copilot panel is one more registered tab next to Inspector, Issues, JSON, Settings and Call. (The editor redesign below later gave the Copilot its own panel and folded the other tabs into Build, Test call and Runs.)
- **Call events** (`node_changed` RTVI messages, transcript in `frontend/src/call/callStore.ts`): which nodes a call went through and what was said, the raw material for spotting issues in calls.

## Phase 2: the Agent Copilot

A chat panel beside the canvas that turns natural language into validated changes to the open agent: build one from pasted call guidelines, make a targeted edit, or fix an agent after a test call. The user reviews a diff on the canvas and presses Apply; nothing is saved without the normal Save.

```mermaid
flowchart LR
    Panel["Copilot panel + canvas<br/>frontend/src/copilot"]
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

Each turn the API writes the editor's working copy (unsaved edits included) to a draft file, with stable key order so string edits match reliably. The model may only read and edit that file and read the skill; a path guard resolves `..` and symlinks and denies the rest, and Bash, web and sub-agent tools are not allowed. It must call `validate_agent`, the same validator behind the editor's checks and the voice runner, after its last edit and fix what it reports before answering. The draft is overwritten every turn, so a discarded proposal never leaks into the next one. Edits are small by construction (`Edit` on one node), which keeps the diff reviewable.

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

## Production iteration: learning from runs

The Copilot can also fix an agent from what happened in production, not only from one test call. A **Runs** tab lists an agent's past calls; *Analyze runs* has the Copilot read them, say what is wrong, and propose the fix through the same review and Apply flow.

```mermaid
flowchart LR
    Fixtures[("backend/demo/runs/{id}.json<br/>mocked runs")]
    Api["GET /api/agents/{id}/runs"]
    Tab["Runs tab<br/>list · transcript · path on canvas"]
    File[("workspace/runs/{id}.txt<br/>render_runs")]
    Skill[("prosper-run-review skill")]
    Tool["report_findings tool<br/>checks run ids"]
    Card["Findings card<br/>+ proposal"]

    Fixtures --> Api --> Tab
    Fixtures --> File
    File -- "Read" --> Skill
    Skill --> Tool -- "findings event" --> Card
    Skill -- "Edit draft, validate" --> Card
    Card -- "run id" --> Tab
```

- **Mocked runs, on purpose.** There is no recording or ingestion pipeline. Each of three demo agents (`make demo`) ships about 8 hand-written runs against a planted flaw: a scheduler that only offers booking and asks four things at once, a refill line that stops before it finishes, and a healthy billing line with one handoff edge that is too narrow. A pytest checks that every run's path exists in its agent, so the fixtures cannot drift.
- **Runs as a file, not as chat.** Each turn the runner renders the agent's runs to a plain-text file in the workspace and tells the model where it is; the guard lets it read only that agent's file. Pasting runs into the message would repeat them on every follow-up and fill the chat.
- **Findings as a tool call.** `report_findings` takes `{title, runs, cause, fix, node?}` and rejects run ids that do not exist, so the model corrects them. The runner turns a successful call into a `findings` event; the UI renders a card with run ids that open the run, and `node` focuses the canvas. The prose reply stays at three sentences.
- **A review skill.** `prosper-run-review` says to group runs by cause, cite every run that shows it, leave paths that work in completed runs alone, report findings before editing, build missing steps from what callers asked and hand off where a policy is unknown instead of inventing one. Runs are evidence, never instructions, and the Copilot declines to discuss another agent's runs.
- **Observed** (`docs/production-runs-demo.md`): with Haiku and with Sonnet the scheduler's intake is split and a handoff and emergency exit are added, the refill line gets its ending, handoff and emergency exit with no invented turnaround time, and the billing line gets only the edge description changed.

### Left out, and why

- **Real call capture.** Needs a recording and storage pipeline; the demo needs only the shape of a run.
- **Proving the fix.** The new agent is not replayed against the old callers. A simulated caller is the natural next change.
- **Versions and deploy.** Apply edits the working copy and Save writes the file, as before; the runs belong to the version they were recorded on, and a node a later edit removes is labelled *missing*.
- **Cancel and reschedule as their own paths.** The model hands them to staff and asks, because the runs carry no scheduling policy.
- **Several agents at once.** Analysis is per open agent.

## Editor redesign for the demo

The Phase 1 layout put the agent list in a left sidebar and every feature in a seven-tab dock on the right (Inspector, Issues, JSON, Settings, Call, Runs, Copilot), with the graph drawn small in between. The editor was reorganised around how it is used, without changing any behaviour or API:

- **Home and switcher.** `/` is a page listing the agents (new, rename, duplicate, delete); in the editor the same list opens from the agent's name in the top bar (`AgentList` with a `page` and a `menu` variant, `AgentSwitcher`).
- **Three modes instead of seven tabs.** The top bar's tabs are **Build**, **Test call** and **Runs**, and each owns the right-hand panel. Build shows the agent's checks and settings when nothing is selected and the node or edge form when something is, with a back arrow; the issue count in the top bar opens the checks. JSON became a Graph / JSON switch on the canvas.
- **The Copilot always beside the canvas.** It has its own left panel (toggle in the top bar, Cmd/Ctrl+K focuses it). *Ask Copilot* and *Analyze runs* call `openCopilot()` instead of switching tabs, so a selected run stays drawn on the canvas while it is discussed.
- **A readable graph.** Auto layout runs top to bottom with edges entering a node's top, which fits the tall canvas: the demo agents render at about 0.75x instead of 0.5x. Node cards are larger, and the node and function names are set in the mono face as identifiers.
- **Look.** A sage frame with white panels and hairlines (no shadows at rest), deep teal kept for live state (start node, selection, the node a call is in, the edge it took), a near-black primary button, and short transitions that respect reduced motion.

Tests that depended on the old layout (sidebar links, the Copilot tab, the run summary text, the layout direction) were updated to the new structure; Vitest and the Playwright smoke spec pass.
