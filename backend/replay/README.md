# replay

Text simulator that replays a production run against an agent graph (openspec change `1-replay-runs-against-fix`). Backend tests never call OpenAI: they pass a scripted fake `ChatClient`.

| Module | Role |
| --- | --- |
| `nodes.py` | Per-node system text, task messages, tools and actions from `AgentConfig`; kept in parity with `AgentBuilder._make_node` by `tests/test_replay_nodes.py`. |
| `simulator.py` | `replay(agent, caller, chat_client, max_turns=12)`: the agent speaks first, edge calls move to the target and are recorded in `path`, `tts_say` is verbatim, `end_conversation` / `end` nodes end the call, the turn limit gives `stuck`, `[HANGUP]` from the caller ends it. |
| `caller.py` | Simulated caller (`gpt-4o-mini`, temperature 0.4) seeded with the original caller lines and the run's `goal` (or a cached one-line summary). |
| `judge.py` | `gpt-4o-mini` JSON-schema verdict `{outcome, goal_met, reason}`; the turn limit forces `stuck`, an emergency instruction followed by a hang-up forces `transferred` with the goal met. |
| `client.py` | `ChatClient` protocol and the `OpenAIChatClient` (reads `OPENAI_API_KEY`). |

The API endpoint and the key requirement are documented when the replay API lands (group 2).
