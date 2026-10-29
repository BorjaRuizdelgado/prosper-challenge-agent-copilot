import { useState } from "react";
import type { AgentNode, TaskMessage } from "../model";
import { useAgentStore } from "../store";

const ROLES = ["developer", "system", "user", "assistant"];

const NAME_ERRORS = {
  blank: "A node needs a name.",
  duplicate: "Another node already has this name.",
  unknown: "This node no longer exists.",
};

function NameField({ node }: { node: AgentNode }) {
  const renameNode = useAgentStore((s) => s.renameNode);
  const [value, setValue] = useState(node.name);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const result = renameNode(node.name, value);
    if (result.ok) setError(null);
    else setError(NAME_ERRORS[result.reason]);
  };

  return (
    <div className="field">
      <label htmlFor="node-name">Name</label>
      <input
        id="node-name"
        className="mono"
        value={value}
        aria-invalid={error !== null}
        aria-describedby={error ? "node-name-error" : undefined}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {error && (
        <p id="node-name-error" className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function TaskMessages({ node }: { node: AgentNode }) {
  const updateNode = useAgentStore((s) => s.updateNode);
  const messages = node.task_messages ?? [];
  const set = (next: TaskMessage[]) => updateNode(node.name, { task_messages: next });
  const change = (i: number, patch: Partial<TaskMessage>) =>
    set(messages.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...messages];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    set(next);
  };

  return (
    <fieldset className="field">
      <legend>Task messages</legend>
      {messages.length === 0 && <p className="field__hint">No task yet. The agent has nothing to do in this node.</p>}
      <ol className="messages">
        {messages.map((m, i) => (
          <li key={i} className="messages__item">
            <div className="messages__row">
              <select aria-label={`Role of message ${i + 1}`} value={m.role} onChange={(e) => change(i, { role: e.target.value })}>
                {(ROLES.includes(m.role) ? ROLES : [...ROLES, m.role]).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button type="button" aria-label={`Move message ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label={`Move message ${i + 1} down`} disabled={i === messages.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" aria-label={`Remove message ${i + 1}`} onClick={() => set(messages.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
            <textarea
              aria-label={`Content of message ${i + 1}`}
              rows={4}
              value={m.content}
              onChange={(e) => change(i, { content: e.target.value })}
            />
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => set([...messages, { role: "developer", content: "" }])}>
        Add message
      </button>
    </fieldset>
  );
}

/** A JSON array editor that only writes valid arrays back to the node. */
function ActionsField({ node, field, label }: { node: AgentNode; field: "pre_actions" | "post_actions"; label: string }) {
  const updateNode = useAgentStore((s) => s.updateNode);
  const [text, setText] = useState(() => JSON.stringify(node[field] ?? [], null, 2));
  const [error, setError] = useState<string | null>(null);
  const id = `node-${field}`;

  const change = (next: string) => {
    setText(next);
    try {
      const parsed: unknown = JSON.parse(next || "[]");
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array.");
      setError(null);
      updateNode(node.name, { [field]: parsed });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="mono"
        rows={4}
        spellCheck={false}
        value={text}
        aria-invalid={error !== null}
        onChange={(e) => change(e.target.value)}
      />
      {error && (
        <p className="field__error" role="alert">
          Not saved to the node: {error}
        </p>
      )}
    </div>
  );
}

export function NodeForm({ node }: { node: AgentNode }) {
  const updateNode = useAgentStore((s) => s.updateNode);
  return (
    <form className="node-form" aria-label="Node" onSubmit={(e) => e.preventDefault()}>
      <NameField node={node} />
      <label className="field field--check">
        <input type="checkbox" checked={!!node.end} onChange={(e) => updateNode(node.name, { end: e.target.checked })} />
        Ends the call
      </label>
      <TaskMessages node={node} />
      <div className="field">
        <label htmlFor="node-role">Role override</label>
        <textarea
          id="node-role"
          rows={3}
          placeholder="Leave empty to keep the agent persona"
          value={node.role_message ?? ""}
          onChange={(e) => updateNode(node.name, { role_message: e.target.value || null })}
        />
      </div>
      <ActionsField node={node} field="pre_actions" label="Pre-actions (JSON)" />
      <ActionsField node={node} field="post_actions" label="Post-actions (JSON)" />
    </form>
  );
}
