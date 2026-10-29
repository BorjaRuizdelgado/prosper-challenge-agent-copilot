# Proposal

## Why

Phase 1 of the challenge asks for a UI to create and edit voice agents (a graph of nodes and transitions) and place a test call from it. Today the backend can run one hardcoded agent (`AGENT_FLOW` in `bot.py`), agents can only be changed by hand-editing JSON, and the only test-call UI is Pipecat's prebuilt `/client` page, which knows nothing about agents. The deployment team cannot build, inspect or try an agent without touching code, and Phase 2 (the Copilot) has no shared store or UI surface to work on.

## What Changes

- Add a `frontend/` React + TypeScript app (Vite) that is the agent builder: agent list, graph canvas, node/edge editing, agent settings, validation and a test-call panel.
- Add a small HTTP API to the backend (`backend/api/`) that stores agents as JSON files in `backend/agents/` (list, get, create, save, duplicate, delete, validate), seeded from `example_flow.json`.
- Strengthen `AgentBuilder` validation so it reports every problem (unknown targets, unreachable nodes, duplicate names, no terminal node) as structured issues, reused by the API.
- Change `bot.py` so each call runs the agent selected by the client (`agent_id` passed when the session starts) instead of a hardcoded file, and emits node-transition events so the UI can show where the conversation is.
- Add an optional `layout` field (node positions) to the agent JSON; the backend preserves it and ignores it at runtime.
- Add `make` targets (`dev`, `api`, `frontend`) and docs so one command starts everything.
- Pick libraries that Phase 2 can build on: Pipecat's JS client (which also carries text/RTVI messages for a Copilot chat), a right-hand dock that can host more tabs, and the agent JSON as the single shared contract.

## Capabilities

### New Capabilities
- `agent-management`: Persisting agents as JSON on the backend and the UI to list, create, rename, duplicate and delete them.
- `agent-graph-editor`: Visual node-graph canvas to view and edit nodes, edges and their collected parameters, with auto layout and saved positions.
- `agent-configuration`: Agent-level settings (persona, voice, model), live validation feedback, and a raw JSON view of the agent.
- `test-call`: Placing a browser voice call to the selected (saved) agent with live transcript, call controls and active-node highlighting.

### Modified Capabilities
<!-- None: openspec/specs/ is empty; the existing backend behavior is not yet specified. -->

## Impact

- New: `frontend/` (Vite, React, TS, `@xyflow/react`, `@dagrejs/dagre`, `zustand`, `@pipecat-ai/client-js`, `@pipecat-ai/client-react`, `@pipecat-ai/small-webrtc-transport`, Vitest, one Playwright smoke test).
- New: `backend/api/` (FastAPI app, uvicorn is already installed via the Pipecat `runner` extra), `backend/agents/`, pytest tests.
- Modified: `backend/bot.py`, `backend/agent_builder/{schema,builder}.py`, `Makefile`, `README.md`, `solution.md`, `.gitignore`.
- Runtime: two backend processes (Pipecat runner on 7860, agents API on 8000) plus the Vite dev server, joined by a dev proxy.
- Out of scope: auth, multi-user editing/versioning, call recordings, analytics, the Copilot itself (Phase 2), mobile/responsive layouts (laptop-width only), undo/redo.
