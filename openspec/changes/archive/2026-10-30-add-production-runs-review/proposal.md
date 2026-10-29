# Proposal

## Why

The challenge's second workflow is production iteration: agents are fixed after real calls go wrong, and finding those calls is itself manual work. The copilot can already fix an agent from one test call; this change shows the next step, where it reads a batch of production runs, says what went wrong and why, and proposes a better agent. There is no real call data, so the runs are mocked, which the challenge allows.

## What Changes

- **Mocked production runs.** A committed set of fake calls for a few demo agents, each with a transcript, the node path it took (the trace), an outcome (completed, transferred, abandoned, stuck) and, for some, a flag a client raised ("Caller could not cancel"). The runs are fixed data; nothing records new ones.
- **Demo agents** that are "in production" and visibly flawed, seeded with `make demo` (which also resets them):
  - a scheduler that cannot cancel or reschedule, and asks for everything in one question, so callers give up;
  - an unfinished refill line whose flow stops at a node with no way forward, so every call stalls;
  - a billing line that mostly works, to show the copilot leaving a healthy agent alone apart from one small fix.
- **Runs tab** in the editor dock for the open agent: a summary (calls, completed, transferred, abandoned, stuck, flagged), the list of runs, and one run's transcript and path. Selecting a run highlights its path on the canvas. Agents with no runs say so.
- **Analyze runs.** A button in the Runs tab sends the agent's runs to the copilot in one click. The copilot reads them, reports **findings** (each with the problem, the calls that show it, the cause in the graph, and the fix), then proposes the improved agent through the existing live draft, proposal card and Apply flow. For the unfinished refill line it builds the missing flow from what callers asked for.
- **Ask about one run.** Each run offers "Ask Copilot", which prefills the copilot input with that run's transcript and path, like the existing Ask Copilot after a test call.
- The copilot may read the open agent's runs file (read-only) in addition to its draft; everything else stays denied.

Out of scope: real call ingestion, automatic flagging of new calls, scoring a fix by replaying runs against the new agent, and versioning (applying the proposal changes the open agent's working copy, as any proposal does).

## Capabilities

### New Capabilities
- `production-runs`: Mocked production calls per agent, the demo agents they belong to, and the Runs tab for browsing them and their traces.

### Modified Capabilities
- `agent-copilot`: The copilot can analyze an agent's production runs, report findings tied to specific calls, and propose an improved agent; it may read that agent's runs in addition to its draft.

## Impact

- **Backend**: `backend/demo/` with demo agents and their runs (committed JSON); `GET /api/agents/{id}/runs`; a `make demo` target that writes the demo agents into the agents directory; the copilot runner copies the agent's runs into its workspace each turn; the path guard allows Read on that file; a `report_findings` tool next to `validate_agent`; a new `findings` stream event; a run-review section in the system prompt and a `prosper-run-review` skill.
- **Frontend**: a Runs dock tab, a runs API client, canvas path highlight for a selected run, a Findings card in copilot replies (kept across reloads with the chat), and the "Analyze runs" and per-run "Ask Copilot" actions.
- **Docs**: a demo script (`docs/production-runs-demo.md`), README and `solution.md` sections.
- No new dependencies.
