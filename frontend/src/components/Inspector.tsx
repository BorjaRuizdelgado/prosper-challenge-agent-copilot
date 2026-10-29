import { useAgentStore } from "../store";
import { NodeForm } from "./NodeForm";

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="inspector__field">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value || "—"}</dd>
    </div>
  );
}

/** Nodes are editable; edges stay read-only until the edge form lands. */
export function Inspector() {
  const agent = useAgentStore((s) => s.agent);
  const selection = useAgentStore((s) => s.selection);
  if (!agent || !selection) return <p className="dock__empty">Select a node or an edge to inspect it.</p>;

  const node = agent.nodes.find((n) => n.name === selection.node);
  if (!node) return <p className="dock__empty">Select a node or an edge to inspect it.</p>;

  if (selection.kind === "node") return <NodeForm key={node.name} node={node} />;

  const edge = (node.edges ?? []).find((e) => e.function === selection.function);
  if (!edge) return <p className="dock__empty">Select a node or an edge to inspect it.</p>;
  const params = Object.entries(edge.properties ?? {});
  return (
    <dl className="inspector" aria-label="Edge">
      <Field label="Function" value={edge.function} mono />
      <Field label="From" value={node.name} mono />
      <Field label="Target" value={edge.target} mono />
      <Field label="Description" value={edge.description} />
      {params.map(([name, p]) => (
        <Field
          key={name}
          label={`Parameter ${name}${edge.required?.includes(name) ? " (required)" : ""}`}
          value={[p.type, p.enum?.join(" | "), p.description].filter(Boolean).join(" · ")}
        />
      ))}
    </dl>
  );
}
