import { useState } from "react";
import type { AgentNode, Edge, Param } from "../model";
import { useAgentStore } from "../store";

const SCALARS = ["string", "number", "integer", "boolean"];
const TYPES = [...SCALARS, "array"];
const TYPE_LABELS: Record<string, string> = { array: "list" };

/** Types whose values can be restricted to a list of allowed values. */
const ENUMERABLE = ["string", "number", "integer"];

/** Allowed values typed as text, converted to the parameter's type; null when one does not fit it. */
function parseEnum(text: string, type: string): Array<string | number> | null {
  const values = text
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (type === "string") return values;
  const numbers = values.map(Number);
  const fits = numbers.every((n) => (type === "integer" ? Number.isInteger(n) : Number.isFinite(n)));
  return fits ? numbers : null;
}

const FUNCTION_ERRORS = {
  blank: "An edge needs a function name.",
  invalid: "Use only letters, digits, _ and - (up to 64), e.g. book_appointment.",
  duplicate: "Another edge on this node already uses this name.",
  unknown: "This edge no longer exists.",
};

/** Entries with one key swapped for another, keeping their order. */
function renameKey<T>(map: Record<string, T>, from: string, to: string): Record<string, T> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k === from ? to : k, v]));
}

function FunctionField({ node, edge }: { node: AgentNode; edge: Edge }) {
  const renameEdge = useAgentStore((s) => s.renameEdge);
  const [value, setValue] = useState(edge.function);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const result = renameEdge(node.name, edge.function, value);
    setError(result.ok ? null : FUNCTION_ERRORS[result.reason]);
  };

  return (
    <div className="field">
      <label htmlFor="edge-function">Function</label>
      <input
        id="edge-function"
        className="mono"
        value={value}
        aria-invalid={error !== null}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ParamRow({ node, edge, name }: { node: AgentNode; edge: Edge; name: string }) {
  const updateEdge = useAgentStore((s) => s.updateEdge);
  const properties = edge.properties ?? {};
  const param = properties[name];
  const required = edge.required ?? [];
  const [draft, setDraft] = useState(name);
  const [enumText, setEnumText] = useState((param.enum ?? []).join(", "));
  const [enumError, setEnumError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const type = param.type ?? "string";
  const editable = TYPES.includes(type);

  const patch = (next: Param) => updateEdge(node.name, edge.function, { properties: { ...properties, [name]: next } });

  /** Writes `values` as the allowed values of a `type` parameter, or drops them when empty. */
  const withEnum = (base: Param, values: Array<string | number> | null): Param => {
    const { enum: _drop, ...rest } = base;
    return values?.length ? { ...rest, enum: values } : rest;
  };

  const changeType = (next: string) => {
    const { items: _items, ...rest } = param;
    let updated: Param = { ...rest, type: next };
    if (next === "array") updated.items = { type: "string" };
    // Allowed values only make sense for scalars, and must be re-read as the new type.
    const values = ENUMERABLE.includes(next) ? parseEnum(enumText, next) : null;
    updated = withEnum(updated, values);
    if (!ENUMERABLE.includes(next)) setEnumText("");
    setEnumError(ENUMERABLE.includes(next) && values === null ? `Allowed values must all be ${next === "integer" ? "whole numbers" : "numbers"}.` : null);
    patch(updated);
  };

  const commitName = () => {
    const to = draft.trim();
    if (to === name) return setError(null);
    if (!to) return setError("A parameter needs a name.");
    if (to in properties) return setError("Another parameter already has this name.");
    setError(null);
    updateEdge(node.name, edge.function, {
      properties: renameKey(properties, name, to),
      required: required.map((r) => (r === name ? to : r)),
    });
  };

  const changeEnum = (text: string) => {
    setEnumText(text);
    const values = parseEnum(text, type);
    if (values === null) {
      setEnumError(`Allowed values must all be ${type === "integer" ? "whole numbers" : "numbers"}.`);
      return;
    }
    setEnumError(null);
    patch(withEnum(param, values));
  };

  const remove = () => {
    const { [name]: _gone, ...rest } = properties;
    updateEdge(node.name, edge.function, { properties: rest, required: required.filter((r) => r !== name) });
  };

  return (
    <li className="params__item">
      <div className="messages__row">
        <input
          className="mono"
          aria-label={`Name of parameter ${name}`}
          aria-invalid={error !== null}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <select aria-label={`Type of ${name}`} value={type} onChange={(e) => changeType(e.target.value)}>
          {(editable ? TYPES : [...TYPES, type]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>
        <button type="button" aria-label={`Remove parameter ${name}`} onClick={remove}>
          Remove
        </button>
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <input
        aria-label={`Description of ${name}`}
        placeholder="What the agent should collect"
        value={param.description ?? ""}
        onChange={(e) => patch({ ...param, description: e.target.value })}
      />
      {type === "array" && (
        <label className="field--check">
          Each item is a
          <select
            aria-label={`Item type of ${name}`}
            value={param.items?.type ?? ""}
            onChange={(e) => patch({ ...param, items: { ...(param.items ?? {}), type: e.target.value } })}
          >
            {!param.items?.type && <option value="">choose a type</option>}
            {SCALARS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
      {!editable && <p className="field__hint">A {type} parameter has a nested schema; edit it in the JSON view.</p>}
      {ENUMERABLE.includes(type) && (
        <input
          aria-label={`Allowed values of ${name}`}
          aria-invalid={enumError !== null}
          placeholder="Allowed values, comma separated (optional)"
          value={enumText}
          onChange={(e) => changeEnum(e.target.value)}
        />
      )}
      {enumError && (
        <p className="field__error" role="alert">
          {enumError}
        </p>
      )}
      <label className="field--check">
        <input
          type="checkbox"
          checked={required.includes(name)}
          onChange={(e) =>
            updateEdge(node.name, edge.function, {
              required: e.target.checked ? [...required, name] : required.filter((r) => r !== name),
            })
          }
        />
        Required
      </label>
    </li>
  );
}

function Parameters({ node, edge }: { node: AgentNode; edge: Edge }) {
  const updateEdge = useAgentStore((s) => s.updateEdge);
  const properties = edge.properties ?? {};
  const names = Object.keys(properties);

  const add = () => {
    let name = "param";
    for (let i = 2; name in properties; i++) name = `param_${i}`;
    updateEdge(node.name, edge.function, { properties: { ...properties, [name]: { type: "string", description: "" } } });
  };

  return (
    <fieldset className="field">
      <legend>Collected parameters</legend>
      {names.length === 0 && <p className="field__hint">This edge collects nothing from the caller.</p>}
      <ul className="params">
        {names.map((name) => (
          <ParamRow key={name} node={node} edge={edge} name={name} />
        ))}
      </ul>
      <button type="button" onClick={add}>
        Add parameter
      </button>
    </fieldset>
  );
}

export function EdgeForm({ node, edge }: { node: AgentNode; edge: Edge }) {
  const agent = useAgentStore((s) => s.agent)!;
  const updateEdge = useAgentStore((s) => s.updateEdge);
  const retargetEdge = useAgentStore((s) => s.retargetEdge);
  const removeEdge = useAgentStore((s) => s.removeEdge);
  return (
    <form className="node-form" aria-label="Edge" onSubmit={(e) => e.preventDefault()}>
      <FunctionField node={node} edge={edge} />
      <div className="field">
        <label htmlFor="edge-from">From</label>
        <input id="edge-from" className="mono" value={node.name} readOnly />
      </div>
      <div className="field">
        <label htmlFor="edge-target">Target</label>
        <select id="edge-target" className="mono" value={edge.target} onChange={(e) => retargetEdge(node.name, edge.function, e.target.value)}>
          {agent.nodes.map((n) => (
            <option key={n.name}>{n.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="edge-description">Description</label>
        <textarea
          id="edge-description"
          rows={3}
          value={edge.description}
          onChange={(e) => updateEdge(node.name, edge.function, { description: e.target.value })}
        />
      </div>
      <Parameters node={node} edge={edge} />
      <button type="button" onClick={() => removeEdge(node.name, edge.function)}>
        Delete edge
      </button>
    </form>
  );
}
