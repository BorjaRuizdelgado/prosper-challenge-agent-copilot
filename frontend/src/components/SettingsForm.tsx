import { useEffect, useState } from "react";
import { getGuidelines, saveGuidelines } from "../api";
import { CHECK_COVERAGE, useCopilotStore } from "../copilot/copilotStore";
import { type Option, MODELS, VOICES } from "../options";
import { useAgentStore } from "../store";

const CUSTOM = "__custom__";

/** A select over curated options plus "Custom…", which reveals a free-text input for any other value. */
function ChoiceField({ id, label, options, value, onChange }: { id: string; label: string; options: Option[]; value: string; onChange: (v: string) => void }) {
  const known = options.some((o) => o.value === value);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={known ? value : CUSTOM} onChange={(e) => onChange(e.target.value === CUSTOM ? (known ? "" : value) : e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {!known && (
        <input
          className="mono"
          aria-label={`Custom ${label.toLowerCase()}`}
          value={value}
          placeholder={`Enter a ${label.toLowerCase()}`}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** The client's guidelines stored with the agent: read, edit and save without touching the graph. */
function GuidelinesSection() {
  const agentId = useAgentStore((s) => s.agentId);
  const openCopilot = useAgentStore((s) => s.openCopilot);
  const [text, setText] = useState<string | null | undefined>(undefined); // undefined: loading
  const [draft, setDraft] = useState<string | null>(null); // non-null while editing
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let live = true;
    getGuidelines(agentId).then(
      (t) => live && setText(t),
      (e: Error) => {
        if (!live) return;
        setText(null);
        setError(e.message);
      },
    );
    return () => {
      live = false;
    };
  }, [agentId]);

  if (!agentId || text === undefined) return null;

  const save = async () => {
    if (draft === null) return;
    try {
      await saveGuidelines(agentId, draft);
      setText(draft);
      setDraft(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const check = () => {
    const agent = useAgentStore.getState().agent;
    if (!agent) return;
    openCopilot();
    void useCopilotStore.getState().send(agentId, CHECK_COVERAGE, agent);
  };

  return (
    <section className="field guidelines-section" aria-label="Client guidelines">
      <span className="guidelines-section__title">Client guidelines</span>
      {draft !== null ? (
        <>
          <textarea aria-label="Guidelines text" rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="guidelines-section__actions">
            <button type="button" className="primary" disabled={!draft.trim()} onClick={save}>
              Save
            </button>
            <button type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </>
      ) : text === null ? (
        <div className="guidelines-section__actions">
          <button type="button" onClick={() => setDraft("")}>
            Add guidelines
          </button>
        </div>
      ) : (
        <>
          <pre className="guidelines-section__text">{text}</pre>
          <span className="guidelines-section__meta">{wordCount(text).toLocaleString()} words</span>
          <div className="guidelines-section__actions">
            <button type="button" onClick={() => setDraft(text)}>
              Edit
            </button>
            <button type="button" onClick={check}>
              Check coverage
            </button>
          </div>
        </>
      )}
      {error && (
        <span role="alert" className="guidelines-section__error">
          {error}
        </span>
      )}
    </section>
  );
}

/** Agent-level settings: name, global persona, voice and model. */
export function SettingsForm() {
  const agent = useAgentStore((s) => s.agent);
  const agentId = useAgentStore((s) => s.agentId);
  const updateSettings = useAgentStore((s) => s.updateSettings);
  if (!agent) return null;
  return (
    <form className="node-form" aria-label="Agent settings" onSubmit={(e) => e.preventDefault()}>
      <div className="field">
        <label htmlFor="agent-name">Name</label>
        <input id="agent-name" value={agent.name} onChange={(e) => updateSettings({ name: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="agent-persona">Persona</label>
        <textarea
          id="agent-persona"
          rows={6}
          placeholder="Who the agent is, how it speaks. Applies to every node."
          value={agent.persona ?? ""}
          onChange={(e) => updateSettings({ persona: e.target.value })}
        />
      </div>
      <ChoiceField
        id="agent-voice"
        label="Voice"
        options={VOICES}
        value={agent.voice_id ?? VOICES[0].value}
        onChange={(voice_id) => updateSettings({ voice_id })}
      />
      <ChoiceField id="agent-model" label="Model" options={MODELS} value={agent.model ?? MODELS[0].value} onChange={(model) => updateSettings({ model })} />
      {/* keyed so switching agent starts from a clean loading state */}
      <GuidelinesSection key={agentId} />
    </form>
  );
}
