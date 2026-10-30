import { useEffect, useRef } from "react";
import { buildCallMessage } from "../call/askCopilot";
import { clearCall, useCallStore } from "../call/callStore";
import { useCopilotStore } from "../copilot/copilotStore";
import { MODELS, VOICES } from "../options";
import { blockingIssues, useAgentStore } from "../store";

const STATE_LABEL = { idle: "Ready", connecting: "Connecting…", live: "Live", ended: "Call ended", failed: "Call failed" } as const;

/** Test call: talk to the saved version of the open agent. */
export function CallPanel() {
  const agentId = useAgentStore((s) => s.agentId);
  const dirty = useAgentStore((s) => s.dirty);
  const saving = useAgentStore((s) => s.saveStatus === "saving");
  const blocking = useAgentStore((s) => blockingIssues(s.issues).length);
  const save = useAgentStore((s) => s.save);
  const openCopilot = useAgentStore((s) => s.openCopilot);
  const agent = useAgentStore((s) => s.agent);
  const { state, message, muted, transcript, start, hangUp, toggleMute } = useCallStore();
  // Opening the tab starts a fresh session; only a call still in progress is kept.
  useEffect(() => {
    const { state } = useCallStore.getState();
    if (state !== "connecting" && state !== "live") clearCall();
  }, []);
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // Braces matter: scrollIntoView() may return a value, which React would treat as the effect's cleanup.
    end.current?.scrollIntoView?.({ block: "end" });
  }, [transcript]);

  const busy = state === "connecting" || state === "live";
  const blockedReason = blocking > 0 ? `Fix the ${blocking} error${blocking === 1 ? "" : "s"} in Issues before calling.` : null;

  const call = async () => {
    if (!agentId) return;
    if (dirty && !(await save())) return;
    await start(agentId);
  };

  const askCopilot = () => {
    useCopilotStore.getState().setPrefill(buildCallMessage(transcript));
    openCopilot();
  };

  return (
    <div className="call">
      <p className={`call__state call__state--${state}`} role="status" data-testid="call-state">
        {STATE_LABEL[state]}
      </p>
      {message && (
        <p className="call__message" role="alert">
          {message}
        </p>
      )}
      {busy ? (
        <div className="call__controls">
          {state === "live" && (
            <button type="button" onClick={toggleMute} aria-pressed={muted}>
              {muted ? "Unmute" : "Mute"}
            </button>
          )}
          <button type="button" className="call__hangup" onClick={() => void hangUp()}>
            {state === "connecting" ? "Cancel" : "Hang up"}
          </button>
        </div>
      ) : (
        <div className="call__controls">
          <button type="button" className="primary" disabled={!agentId || saving || !!blockedReason} onClick={() => void call()}>
            {state === "failed" ? "Retry" : dirty ? "Save and call" : "Test call"}
          </button>
        </div>
      )}
      {state === "ended" && transcript.length > 0 && (
        <div className="call__controls">
          <button type="button" onClick={askCopilot}>
            Ask Copilot
          </button>
        </div>
      )}
      {agent && state !== "live" && transcript.length === 0 && (
        <dl className="call__setup" aria-label="Call setup">
          <div>
            <dt>Starts at</dt>
            <dd className="mono">{agent.initial_node || "—"}</dd>
          </div>
          <div>
            <dt>Voice</dt>
            <dd>{VOICES.find((v) => v.value === (agent.voice_id ?? VOICES[0].value))?.label ?? agent.voice_id}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{MODELS.find((m) => m.value === (agent.model ?? MODELS[0].value))?.label ?? agent.model}</dd>
          </div>
        </dl>
      )}
      {state === "idle" && transcript.length === 0 && (
        <p className="field__hint">
          Talk to the agent through your microphone. The canvas follows the call: the node the agent is in glows and the edge it
          took lights up.
        </p>
      )}
      {!busy && blockedReason && <p className="field__hint">{blockedReason}</p>}
      {!busy && !blockedReason && dirty && (
        <p className="field__hint">This agent has unsaved changes. The call always runs the saved version, so it will be saved first.</p>
      )}
      {transcript.length > 0 && (
        <ol className="call__transcript" aria-label="Transcript">
          {transcript.map((entry, i) => (
            <li key={i} className={`call__line call__line--${entry.kind}`}>
              {entry.kind !== "note" && <span className="call__who">{entry.kind === "user" ? "You" : "Agent"}</span>}
              {entry.text}
            </li>
          ))}
          <li ref={end} aria-hidden />
        </ol>
      )}
    </div>
  );
}
