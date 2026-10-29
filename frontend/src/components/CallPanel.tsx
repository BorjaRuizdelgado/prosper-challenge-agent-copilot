import { useCallStore } from "../call/callStore";
import { blockingIssues, useAgentStore } from "../store";

const STATE_LABEL = { idle: "Ready", connecting: "Connecting…", live: "Live", ended: "Call ended", failed: "Call failed" } as const;

/** Test call: talk to the saved version of the open agent. */
export function CallPanel() {
  const agentId = useAgentStore((s) => s.agentId);
  const dirty = useAgentStore((s) => s.dirty);
  const saving = useAgentStore((s) => s.saveStatus === "saving");
  const blocking = useAgentStore((s) => blockingIssues(s.issues).length);
  const save = useAgentStore((s) => s.save);
  const { state, message, muted, start, hangUp, toggleMute } = useCallStore();

  const busy = state === "connecting" || state === "live";
  const blockedReason = blocking > 0 ? `Fix the ${blocking} error${blocking === 1 ? "" : "s"} in Issues before calling.` : null;

  const call = async () => {
    if (!agentId) return;
    if (dirty && !(await save())) return;
    await start(agentId);
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
      {!busy && blockedReason && <p className="field__hint">{blockedReason}</p>}
      {!busy && !blockedReason && dirty && (
        <p className="field__hint">This agent has unsaved changes. The call always runs the saved version, so it will be saved first.</p>
      )}
    </div>
  );
}
