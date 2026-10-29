import { useAgentStore } from "../store";
import { EdgeForm } from "./EdgeForm";
import { NodeForm } from "./NodeForm";

/** Edits whichever node or edge is selected. */
export function Inspector() {
  const agent = useAgentStore((s) => s.agent);
  const selection = useAgentStore((s) => s.selection);
  if (!agent || !selection) return <p className="dock__empty">Select a node or an edge to inspect it.</p>;

  const node = agent.nodes.find((n) => n.name === selection.node);
  if (!node) return <p className="dock__empty">Select a node or an edge to inspect it.</p>;

  if (selection.kind === "node") return <NodeForm key={node.name} node={node} />;

  const edge = (node.edges ?? []).find((e) => e.function === selection.function);
  if (!edge) return <p className="dock__empty">Select a node or an edge to inspect it.</p>;
  return <EdgeForm key={`${node.name}::${edge.function}`} node={node} edge={edge} />;
}
