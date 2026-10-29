---
name: prosper-blueprints
description: How to write and change Prosper voice agents (the agent JSON, edges as tools, healthcare voice conventions) and complete example agents to copy from. Load before building an agent or changing its structure.
---

# Prosper Blueprints

An agent is one JSON document: a graph of nodes. The caller talks to the agent at one node at a time; the node's edges are the only ways to move on.

## Agent JSON

Top level:

- `name` (required, non-empty), `initial_node` (required, must be a node name).
- `persona`: the voice and manner, applied to every node.
- `voice_id`, `model`: leave as they are.
- `layout`: editor positions. Never write or change it.
- `nodes`: list of nodes.

Node:

- `name` (required, unique). Short snake_case: `collect_details`.
- `task_messages`: list of `{"role": "developer", "content": "..."}`. What the agent must do at this node. Every node needs at least one.
- `role_message`: optional override of the persona for this node. Usually omit.
- `edges`: transitions out of the node.
- `pre_actions` / `post_actions`: run before the node speaks / after it has spoken. Types: `tts_say` (`{"type": "tts_say", "text": "..."}`) and `end_conversation`. Nothing else works.
- `end`: `true` on a node that ends the call. It hangs up after the node speaks. If you give an end node its own `post_actions`, include `{"type": "end_conversation"}` in them.

## Edges are tools

Each edge is shown to the model as a function it can call. Calling it moves the call to `target`.

- `function`: letters, digits, `_` and `-`, at most 64. Unique within the node. Verb first: `record_details`, `transfer_to_human`.
- `description`: when to call it, written for the model ("Call once the caller has given a date of birth").
- `target`: the name of an existing node.
- `properties`: what the model must collect to take the edge, as JSON-schema fields: `{"dob": {"type": "string", "description": "Date of birth."}}`. Every property has a `type`. An `array` property must have an `items` object. Use `enum` when the answer is one of a fixed set.
- `required`: names that appear in `properties`.

A node needs an edge, or `end: true`. Every node must be reachable from `initial_node`.

## What the validator rejects

Run `validate_agent` after your last edit. It reports, among others: a missing `name`, duplicate node names, an `initial_node` that does not exist, edges with an unknown `target`, a duplicate `function` in one node, invalid function names, array properties without `items`, and unknown action types. Fix every error. Warnings (a node without task messages, an unreachable node, no end node) should also be fixed unless the user wants them.

## Voice conventions

Agents answer phone calls for a clinic, so unless the user's guidelines say otherwise:

- **Spoken style.** Short sentences read aloud. No lists, emojis, markdown or symbols. Write numbers and times the way a person says them.
- **One question at a time.** A node asks for one thing, then waits. Split a long intake into several nodes rather than asking for everything at once.
- **No medical advice.** The agent never diagnoses, recommends treatment or comments on symptoms. It books, answers administrative questions and hands off.
- **Emergencies.** Every agent has a way out for urgent callers: an edge, available from the greeting and any node where it may come up, that tells them to hang up and call emergency services, then ends the call.
- **Human handoff.** Every agent has a way to hand off to a person for anything out of scope, and says so plainly ("I'll connect you with our staff").
- **An end node.** At least one node has `end: true`. It thanks the caller and says goodbye.

## Editing

- Smallest change that does the job. Use `Edit` on the exact text; leave every other node, edge and field as it is, including `layout`.
- Keep existing names unless asked to rename. Renaming a node means updating every edge that targets it.
- When you add a node, add the edge that leads to it and the edges that leave it in the same turn, so the agent stays connected.
- Match the voice of the nodes already there.

## Building a new agent from guidelines

Build it in two passes so the graph appears early on the canvas and fills in node by node:

1. **Skeleton.** `Write` the whole agent once: top-level fields, every node with its `name` and a one-line stub task, and every edge with `function`, a short `description` and its `target`. Include the emergency, handoff and end nodes. No properties yet.
2. **Fill in.** Use `Edit` on one node at a time to replace the stub with the real task messages and add the edge `properties` and `required`.

Then validate. Derive the steps from the user's guidelines; do not invent policies they did not state.

## Blueprints

Complete, valid agents to copy structure and tone from. Read the one closest to the request; do not copy it verbatim.

- `blueprints/scheduling.json`: book, reschedule or cancel an appointment.
- `blueprints/refills.json`: prescription refill requests, without clinical advice.
- `blueprints/billing-faq.json`: billing and insurance questions, with handoff to the billing team.
