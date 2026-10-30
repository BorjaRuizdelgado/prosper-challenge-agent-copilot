# Proposal

## Why

The first manual workflow in the challenge is "translating a client's natural-language guidelines into a working agent". Today that path is a chat example chip ("Build an agent from these call guidelines: …"). Nothing in the product keeps the guidelines, shows whether the agent covers them, or captures what the guidelines leave unsaid. Yet the real cost of an implementation is not typing the nodes. It is checking that every rule the clinic gave made it into the agent, and chasing the clinic for the policies they forgot to state (cancellation window, which insurances, after-hours). The Copilot should hand back both: an agent, and the list of questions to send the client.

## What Changes

- **New from guidelines.** On the home page and in the agent switcher: a name plus the client's guidelines, pasted or dropped as a `.md` / `.txt` file, with a *Use sample guidelines* option. It creates the agent, stores the guidelines with it, opens the editor and starts the build turn by itself.
- **Guidelines are kept with the agent** and can be viewed and edited in the Build panel (agent settings). Every copilot turn on that agent can read them, so later edits and checks refer back to the source.
- **Coverage report.** After building, or when asked to check, the Copilot reports each requirement it found in the guidelines (with the quote it came from), its status (*covered*, *covered with a default*, *open*) and the nodes that implement it. A **Coverage card** in the chat shows "Covers 14 of 16 requirements"; hovering a requirement focuses its nodes on the canvas.
- **Questions for the client.** For every policy the guidelines need but do not state, the Copilot builds the safe default (usually a handoff to staff), and lists one question per gap with the default it used. The card offers *Copy as email*. When the user pastes the client's answers into the chat, the Copilot updates the agent and reports coverage again with those questions resolved.
- **The build no longer stops to ask.** For a build from guidelines, unknown policy becomes a default plus a question instead of a blocking clarification. Ordinary edit requests keep the current "ask one short question" rule.
- **A realistic sample:** one clinic's guidelines (about a page, written like a client email), with deliberate gaps, in `backend/demo/guidelines/`.

## Demo

**Full path:**
1. Home, **New from guidelines**, *Use sample guidelines* (Maple Family Practice), **Create**.
2. The graph grows node by node on the canvas.
3. The coverage card arrives ("Covers 14 of 16 · 4 questions for the client"). Hover a requirement to see its nodes.
4. **Copy as email**, then show the clipboard text.
5. *Use sample client reply* fills the input; **Send**.
6. The proposal updates the cancellation path, and the new coverage card has fewer questions.
7. **Apply**.

**Short path (no build wait):** `make demo` also gives *Riverside Clinic Scheduler* the guidelines it was built from. Open it and click **Check coverage** (Build panel, guidelines section). The card shows the guidelines' cancel, reschedule and speak-to-staff rules as *open*. That is the same gap the production runs show, which bridges into the replay demo.

**Placeholders, for the demo only:**
- `backend/demo/guidelines/maple-family-practice.md`, the sample document.
- `maple-family-practice.reply.md`, a canned client email answering three of the questions. *Use sample client reply* fills it into the input without sending, and only shows when a sample is attached.
- `backend/demo/agents/demo-riverside-scheduler.guidelines.md`, written so the seeded scheduler visibly misses three of its rules.

## Capabilities

### New Capabilities
- `client-guidelines`: guidelines stored with an agent, the requirement coverage report, and the questions for the client.

### Modified Capabilities
- `agent-management`: the agents list offers *New from guidelines*; duplicating and deleting an agent carry its guidelines.
- `agent-copilot`: a build from guidelines takes defaults and lists questions instead of asking first; the copilot may read the open agent's guidelines.

## Impact

- Backend: guidelines files next to agents (`backend/agents/<id>.guidelines.md`); `POST /api/agents` accepts `guidelines`; `GET`/`PUT /api/agents/{id}/guidelines`; `GET /api/demo/guidelines`; duplicate and delete handle the file. Runner writes `workspace/guidelines/<id>.md` and names it in the prompt; guard allows Read on it. New `report_coverage` tool and `coverage` event. `prosper-blueprints` skill and system prompt updated.
- Frontend: *New from guidelines* dialog in `AgentList`, guidelines section in `SettingsForm`, `coverage` event in the copilot client and store, `CoverageCard`, copy-as-email.
- Data: `backend/demo/guidelines/maple-family-practice.md` and `.reply.md`; `backend/demo/agents/demo-riverside-scheduler.guidelines.md`, copied by `make demo`.
