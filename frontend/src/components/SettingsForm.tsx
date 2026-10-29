import { type Option, MODELS, VOICES } from "../options";
import { useAgentStore } from "../store";

const CUSTOM = "__custom__";

/** A select over curated options plus "Custom…", which reveals a free-text input for any other value. */
function ChoiceField({ id, label, options, value, onChange }: { id: string; label: string; options: Option[]; value: string; onChange: (v: string) => void }) {
  const known = options.some((o) => o.value === value);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={known ? value : CUSTOM}
        onChange={(e) => onChange(e.target.value === CUSTOM ? (known ? "" : value) : e.target.value)}
      >
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

/** Agent-level settings: name, global persona, voice and model. */
export function SettingsForm() {
  const agent = useAgentStore((s) => s.agent);
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
      <ChoiceField id="agent-voice" label="Voice" options={VOICES} value={agent.voice_id ?? VOICES[0].value} onChange={(voice_id) => updateSettings({ voice_id })} />
      <ChoiceField id="agent-model" label="Model" options={MODELS} value={agent.model ?? MODELS[0].value} onChange={(model) => updateSettings({ model })} />
    </form>
  );
}
