# Design

## Context

- `POST /api/agents {name}` creates `starter_agent(name)` (one `greeting` node) in `backend/agents/<id>.json`; the agents store lists `*.json`.
- `run_turn` writes the draft and the optional runs file into the workspace and names them in the prompt.
- `guard.check_path` allows Read/Edit/Write on the draft, Read on the agent's runs file and the skills, and denies everything else.
- The copilot tools live in `validate_tool.build_server` (`validate_agent`, `report_findings`). The runner forwards an accepted `report_findings` call as a `findings` event, and the store attaches it to the assistant message.
- The `prosper-blueprints` skill already has a skeleton-first build and "do not invent policies".

See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- One click from a client's document to a building agent, with the source kept.
- A coverage report the reviewer can check line by line against the document.
- Open questions as a deliverable, ready to send to the client.

**Non-Goals:**
- PDF or Word parsing. Text and Markdown only; pasting covers the demo.
- Tracking coverage over time or blocking a save on open questions.
- Guidelines versioning, and several documents per agent.

## Decisions

### 1. Guidelines are a sidecar file next to the agent
`backend/agents/<id>.guidelines.md`, written atomically by `store` (`get_guidelines`, `save_guidelines`, copied on duplicate, removed on delete). The agents list keeps globbing `*.json`, so nothing else changes.

Alternative: a `guidelines` field inside the agent JSON. Every copilot draft would then carry a page of text, string edits would get riskier, and the runtime would load prose it never uses.

### 2. API
- `POST /api/agents` accepts an optional `guidelines` (max 50 KB) and stores it.
- `GET /api/agents/{id}/guidelines` returns `{text}`, or `404` when there are none. `PUT` takes `{text}`.
- `GET /api/demo/guidelines` returns `[{name, text}]` from `backend/demo/guidelines/*.md`, for *Use sample guidelines*.

### 3. The copilot reads guidelines from a file, like runs
Before each turn, `run_turn` writes `workspace/guidelines/<id>.md` (or removes a stale one) and adds "The client's guidelines are in guidelines/<id>.md." to the prompt. The guard allows only Read on that one file and denies other agents' guidelines, with the same tests as runs. The text never goes into the chat, so it is not repeated on every follow-up.

### 4. `report_coverage` tool and `coverage` event
The input:
- `requirements: [{id, text, quote, status: "covered"|"default"|"open", nodes: [..], note?}]`
- `questions: [{id, question, default, requirements: [ids]}]`

Checks, made against the draft at call time, so the tool is called after the last edit:
- requirement ids are unique;
- every `nodes` entry exists in the draft;
- `covered` and `default` have at least one node;
- every `default` requirement is referenced by a question.

On a failed check, the error message lists what is wrong. The runner emits `coverage` like `findings` (the last call wins), with a step "Reporting coverage (14/16)". The store attaches it to the assistant message and persists it.

### 5. Skill and prompt changes
`prosper-blueprints`, section "Building a new agent from guidelines":
- Read the guidelines file first.
- List the requirements to yourself (do not write them).
- Build with the skeleton-first method.
- For each policy the agent needs that the guidelines do not state, build the safe default (hand off to staff, promise no time or fee) and do not ask.
- After `validate_agent`, call `report_coverage` with every requirement and the questions.

Further rules:
- "Check coverage" requests: read the guidelines and the draft, then report. No edits unless asked.
- Client answers given in chat: edit the parts they name, then report coverage again.

System prompt "When to ask": the clarify rule applies to edit requests, not to builds from guidelines.

### 6. Frontend
- `AgentList` gets *New from guidelines*: a dialog with name, a textarea, a drop zone or file input (`.md` / `.txt`; other types rejected with a message) and *Use sample guidelines*.
- On confirm: create, navigate to the editor, `openCopilot()`, and `send(id, "Build this agent from the client's guidelines.", agent)`. The user message shows a "Guidelines: Maple Family Practice · 1,240 words" chip.
- `SettingsForm` gets a *Client guidelines* section: read view, Edit with Save and Cancel, and *Add guidelines* when there are none.
- `CoverageCard` sits above the proposal card:
  - a count line;
  - rows grouped by status, with node chips (hover focuses the node, as findings do; click selects it);
  - *Questions for the client* with *Copy as email* (`navigator.clipboard`, with a toast);
  - *Re-check coverage*, which sends a fixed message.

### 7. The sample guidelines
`backend/demo/guidelines/maple-family-practice.md`: about 600–900 words written like a practice manager's email.
- **Covers:** hours, two providers, new and existing patients, appointment types, cancelling and rescheduling, refill requests sent to the pharmacy line, urgent symptoms to 911, Spanish speakers transferred.
- **Planted gaps:**
  - no cancellation notice window;
  - "most major insurance" with no list;
  - new-patient visit length implied but not stated;
  - after-hours nurse line mentioned without a number;
  - no rule for the caller being someone other than the patient.

A pytest asserts that the file exists and is under 50 KB. The demo script records which gaps the model turned into questions.

### 8. Demo placeholders
- **`maple-family-practice.reply.md`.** A practice manager's reply that answers three of the planted gaps: 24 hours' notice for cancellations; Aetna, Blue Cross and UnitedHealthcare accepted; new-patient visits are 40 minutes. It is returned by `GET /api/demo/guidelines` as `reply` next to `text`. When the agent's guidelines equal a sample's text, the coverage card shows *Use sample client reply*, which calls `setPrefill` and does not send.
- **`backend/demo/agents/demo-riverside-scheduler.guidelines.md`.** Short guidelines for the scheduler: booking (name, date of birth, reason, preferred time, which the agent does cover), plus cancelling, rescheduling and asking for front-desk staff (which it does not). `demo/seed.py` copies it with `save_guidelines` and resets it on every seed. The short demo path ties the guidelines gap to the production-runs gap on the same agent.
- **Check coverage** in the guidelines section of `SettingsForm` sends the same fixed message as *Re-check coverage*.

## Risks / Trade-offs

- [The model lists too few requirements, or merges them] → The skill asks for one requirement per rule the clinic states, and the card quotes the source text so a reviewer spots omissions. The demo script records the count per model.
- [Coverage claims a node implements something it does not] → The tool checks only that the node exists, not what it does. The card links to the node so the claim can be checked in one hover. Replay (change `1-replay-runs-against-fix`) is the deeper check.
- [The build turn gets longer with the coverage step] → One tool call after validation. The canvas has already shown the graph growing.
- [The skill change shifts other build behavior] → The existing skill tests stay, and new ones check the new rules are present.
