# Proposal

## Why

The challenge's user is **Prosper's deployment team**: the people who configure agents for clinic clients and iterate on them. The Copilot's system prompt says it helps "a clinic operator", and its reply rules (no node names, no notes about what was assumed) are aimed at a non-technical end user. A deployment engineer needs the opposite. They need to know which nodes changed so they can check them, what the Copilot assumed, and what still has to be confirmed with the client. Getting the user right is a product-sense signal on its own, and it makes every other Copilot reply more useful.

## What Changes

- System prompt: the user is a Prosper deployment engineer working on a clinic client's agent. The clinic is "the client".
- Reply rules: still short, one paragraph, no lists, JSON or file paths. Replies now **name the nodes and edges changed** (by their names), **state any default or assumption taken**, and end with **what to confirm with the client** when a clinic policy was unknown. The "do not add notes about things you left alone" rule stays for unrelated parts; it no longer hides assumptions.
- "When to ask": a decision that belongs to the client (clinic policy) is phrased as a question to take to the client, not as a preference of the user.
- Copilot panel copy: the empty-state text and the example chips describe deployment work ("Build this agent from the client's guidelines", "Add a way to cancel an appointment", "Callers keep asking for a person: add a staff handoff from every step", "Make the intake ask one thing at a time").

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `agent-copilot`: adds a requirement on who the Copilot talks to and what its replies contain.

## Impact

- `backend/copilot/system_prompt.md`, `backend/tests/test_copilot_system_prompt.py` (required phrases updated: the persona line, the new reply rules).
- `frontend/src/components/CopilotPanel.tsx` (`EXAMPLES`, empty-state lede) and its tests.
- No API, data or architecture change, so no design.md. Independent of the other changes. If `2-build-from-client-guidelines` lands, the "confirm with the client" line matches its questions for the client.

## Demo

This change isn't a demo step of its own; it shows up in every Copilot reply. To point at it once:
1. `make demo`, open *Riverside Clinic Scheduler*, Copilot panel.
2. Click the example *Add a way to cancel an appointment* and send it.
3. Point at the reply. It names the nodes and edge it added (e.g. `cancel_appointment` from `greeting`), says cancellations are taken with no notice period, and ends with "Confirm with the client: what notice they require."

**Placeholder:** that example chip is phrased so it reliably triggers an unknown policy (the scheduler has no cancellation rule), which makes the assumption and confirm-with-the-client lines appear on cue.
