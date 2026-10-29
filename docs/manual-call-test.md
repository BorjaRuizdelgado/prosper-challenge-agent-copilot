# Manual test call checklist

The voice path needs a microphone and paid API keys, so it is not automated. Unit tests cover the call
state machine, transcript and active-node handling with a fake client (`frontend/src/call/`), and the
backend loader and transition messages (`backend/tests/test_session.py`, `test_transitions.py`). Run this
checklist once before a demo or after touching either side.

## Setup

1. `make install`, then put real keys in `backend/.env`:
   - `OPENAI_API_KEY`
   - `ELEVENLABS_API_KEY`
2. `make up` (or `make dev`) and open <http://localhost:5173>. Use Chrome or Safari with working audio.
3. Open the seeded **Prosper Scheduler** agent from the sidebar.

## 1. Successful call

1. Open the **Call** tab in the dock. The state reads **Ready** and the button reads **Test call**.
2. Click **Test call** and allow the microphone when the browser asks.
   - Expected: **Connecting…**, then **Live** within a few seconds. The agent speaks its greeting.
   - Expected: the `greeting` node gets a teal outline on the canvas, and the transcript starts with
     `Started at greeting`.
3. Talk to the agent and give it what it asks for (name, a reason for the visit...).
   - Expected: your words and the agent's replies appear in the transcript, alternating.
4. Keep going until the agent moves on.
   - Expected: the next node is outlined within a second, the edge taken is coloured, and the transcript
     shows a note such as `Moved to confirm via collect_details (name: Ana)`.
5. Click **Mute**, speak, and confirm the agent does not react; click **Unmute**.
6. Click **Hang up**.
   - Expected: **Call ended**, the browser's recording indicator goes away, the outline and coloured edge
     clear, and the transcript stays on screen.
7. Click **Test call** again. Expected: the previous transcript is replaced.

## 2. Unsaved changes

1. Edit a node's task text (do not save). The button now reads **Save and call**.
2. Click it. Expected: the agent is saved first (status reads **Saved**), then the call starts and uses the
   edited text.
3. Stop the API (`Ctrl+C` on `make api`, or `pkill -f "uvicorn api.app"`), edit something, and click
   **Save and call**. Expected: the save fails and **no** call starts.

## 3. Blocking validation error

1. Point an edge at a node that does not exist, e.g. in the **JSON** tab, then **Apply**.
2. Expected: the Call button is disabled and a hint reads "Fix the 1 error in Issues before calling."
   Warnings alone do not disable it.

## 4. Microphone denied

1. In the browser's site settings block the microphone for `localhost:5173`.
2. Click **Test call**. Expected: the panel returns to **Ready** with "Microphone access was denied. Allow
   it for this site…". No call starts and no error toast appears.
3. Allow the microphone and click again; it should work.

## 5. Voice backend down

1. Stop the voice runner (`pkill -f "python bot.py"`).
2. Click **Test call**. Expected: **Call failed** with a reason and a **Retry** button.
3. Restart the runner (`make run`) and click **Retry**; the call should connect.

## 6. Missing API keys

1. Empty `OPENAI_API_KEY` in `backend/.env` and restart the runner.
2. Click **Test call**. Expected: after about 20 seconds **Call failed**: "The voice agent did not answer.
   Check that the voice runner is up, that backend/.env has both API keys…". The runner log says
   `Missing API keys in backend/.env: OPENAI_API_KEY`.
   (The runner has no channel to send a reason back before the session exists, so the browser sees a timeout.)

## 7. Unknown agent id

The editor only offers saved agents, so provoke this by hand against a running runner:

```bash
curl -s -X POST localhost:7860/start -H 'content-type: application/json' -d '{"body":{"agent_id":"nope"}}'
```

Then complete the WebRTC offer from a browser, or simply delete the agent file while its page is open
(`rm backend/agents/<id>.json`) and click **Test call**. Expected: **Call failed** after the timeout, and
the runner log says `Unknown agent: 'nope'`. The session never falls back to another agent.

## What to record when something fails

Browser console output, the runner log (the terminal running `make run` / `make dev`), and the step
number above.
