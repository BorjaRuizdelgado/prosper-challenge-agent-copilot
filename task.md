# Product Engineer Challenge

## Overview

Prosper builds voice AI for healthcare phone calls across several use cases, with appointment scheduling as its largest use case.

The challenge has two phases and is expected to take approximately **8–12 hours**.

## Phase 1 — Voice Agent Builder

Build a UI for creating and editing voice agents. An agent is represented as a **graph of nodes**: each node represents a step in the conversation, and each edge represents a transition the agent can take.

Users should be able to edit the node graph and place a test call from the UI. Reference products include [ElevenLabs Agents](https://elevenlabs.io/) and [Retell AI](https://www.retellai.com/).

### What's Already Built

The starter code is available in the [prosper-challenge-agent-copilot repository](https://github.com/Prosper-Technologies/prosper-challenge-agent-copilot).

The backend already includes:

- A [Pipecat](https://github.com/pipecat-ai/pipecat) voice pipeline using WebRTC, ElevenLabs STT/TTS, and an OpenAI LLM.
- A conversation represented as a node graph and implemented with Pipecat Flows.
- A declarative JSON agent definition that is compiled into a runnable flow at runtime by an `AgentBuilder`.
- A browser-based test call.

The repository includes `backend/example_flow.json` to demonstrate the expected format. It is only an example; you are expected to build an agent that fits your solution.

**Phase 1 is primarily about building the UI for editing nodes.** The agent representation and voice runtime already exist, although you may change the node format or backend if you believe there is a better approach.

## Phase 2 — Agent Copilot

This is the more open-ended part of the challenge and is considered especially important.

Prosper's deployment team currently spends significant time on two manual workflows:

1. **Initial implementation:** Translating a client's natural-language guidelines into a working agent.
2. **Production iteration:** Improving agents in response to issues reported by clients or identified in call data. Detecting these issues in calls is itself a manual burden.

Design an **AI Copilot** integrated into the agent-building platform to automate this work, similar to how AI coding tools such as Claude Code and Cursor help users create and improve software.

The goal is to help users quickly create and iterate on agents using natural-language instructions and production feedback. Treat this as an open design problem and propose the best solution you can for the workflows above.

Real call data will not be provided. You may mock example calls or flagged issues to demonstrate the iteration loop.

## Requirements

- A minimal UI where a user can create an agent and place a test call.
- An Agent Copilot integrated into the UI.
- OpenAI and ElevenLabs API keys will be provided separately, but alternative providers are allowed.

## What Will Be Valued

The evaluation prioritizes judgment and product thinking over polish or breadth of features.

- **Originality of the Agent Copilot (Phase 2):** This is the core of the challenge. A thoughtful, intuitive, and novel approach matters more than a feature-complete builder.
- **Problem resolution:** How well the solution addresses the stated problems.
- **Pragmatic scoping:** What you choose to build, mock, or leave out, and why. Knowing what not to build is a positive signal.
- **Product sense and quality:** Whether the solution meaningfully reduces the deployment team's manual work by targeting the real bottlenecks.
- **Demo quality:** The review will include a live, end-to-end demo. Build something that can be demonstrated clearly.

## AI Coding

Use of AI coding tools such as Claude Code and Cursor is strongly encouraged. Most of the implementation may be AI-assisted; what matters is that you can explain and defend your decisions and trade-offs.

## Submission

Submit a link to a repository containing:

- The project code.
- A `solution.md` file explaining the solution and its key architectural decisions.

## Reference Material

The original challenge includes a reference image named `image.png`.
