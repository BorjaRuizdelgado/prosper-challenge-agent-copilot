import { useState } from "react";
import { parseAgent } from "../agentJson";
import { useAgentStore } from "../store";

/** The working agent as editable JSON; only a successful Apply changes the graph. */
export function JsonPanel() {
  const agent = useAgentStore((s) => s.agent);
  const positions = useAgentStore((s) => s.positions);
  const labelOffsets = useAgentStore((s) => s.labelOffsets);
  const replaceAgent = useAgentStore((s) => s.replaceAgent);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; line?: number } | null>(null);
  if (!agent) return null;

  // Until the user types, the text follows the graph (including dragged positions).
  const text = draft ?? JSON.stringify({ ...agent, layout: { ...positions, ...labelOffsets } }, null, 2);

  const apply = () => {
    const result = parseAgent(text);
    if (!result.ok) return setError(result);
    setError(null);
    setDraft(null);
    replaceAgent(result.agent);
  };

  return (
    <div className="json-panel">
      <label htmlFor="agent-json" className="visually-hidden">
        Agent JSON
      </label>
      <textarea
        id="agent-json"
        className="mono json-panel__text"
        spellCheck={false}
        value={text}
        aria-invalid={error !== null}
        onChange={(e) => setDraft(e.target.value)}
      />
      {error && (
        <p className="field__error" role="alert">
          {error.line ? `Line ${error.line}: ` : ""}
          {error.message}
        </p>
      )}
      <div className="json-panel__actions">
        <button type="button" className="primary" disabled={draft === null} onClick={apply}>
          Apply
        </button>
        <button
          type="button"
          disabled={draft === null}
          onClick={() => {
            setDraft(null);
            setError(null);
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
