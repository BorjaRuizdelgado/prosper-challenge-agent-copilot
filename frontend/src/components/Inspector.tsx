import { useAgentStore } from "../store";

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="inspector__field">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value || "—"}</dd>
    </div>
  );
}

/** Read-only for now; editing arrives with the store actions. */
export function Inspector() {
  const agent = useAgentStore((s) => s.agent);
  const selection = useAgentStore((s) => s.selection);
  if (!agent || !selection) return <p className="dock__empty">Select a node or an edge to inspect it.</p>;

  const node = agent.nodes.find((n) => n.name === selection.node);
  if (!node) return <p className="dock__empty">Select a node or an edge to inspect it.</p>;

  if (selection.kind === "node") {
    return (
      <dl className="inspector" aria-label="Node">
        <Field label="Name" value={node.name} mono />
        <Field label="Start node" value={agent.initial_node === node.name ? "Yes" : "No"} />
        <Field label="Ends the call" value={node.end ? "Yes" : "No"} />
        <Field label="Role override" value={node.role_message} />
        {(node.task_messages ?? []).map((m, i) => (
          <Field key={i} label={`Task message ${i + 1} (${m.role})`} value={m.content} />
        ))}
      </dl>
    );
  }

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
