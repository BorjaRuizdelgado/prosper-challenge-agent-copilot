import type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";
import { diffAgents } from "./copilot/diffAgents";
import { resolveLayout } from "./layout";
import type { Agent, AgentNode, Position } from "./model";
import { edgeId } from "./model";
import type { Selection } from "./store";

/** How a node or edge differs in a copilot proposal against the working copy. */
export type Change = "added" | "changed" | "removed";

export type CardData = { node: AgentNode; initial: boolean; change?: Change; [key: string]: unknown };
export type CardNode = FlowNode<CardData, "card">;

/** React Flow nodes/edges derived from the agent document. */
export function toFlow(
  agent: Agent, positions: Record<string, Position>,
  selection: Selection = null,
): { nodes: CardNode[]; edges: FlowEdge[] } {
  const known = new Set(agent.nodes.map((n) => n.name));
  const nodes: CardNode[] = agent.nodes.map((node) => ({
    id: node.name,
    type: "card",
    position: positions[node.name] ?? { x: 0, y: 0 },
    selected: selection?.kind === "node" && selection.node === node.name,
    data: { node, initial: node.name === agent.initial_node },
  }));
  const edges: FlowEdge[] = agent.nodes.flatMap((node) =>
    (node.edges ?? [])
      .filter((e) => known.has(e.target))
      .map((e) => ({
        id: edgeId(node.name, e.function),
        source: node.name,
        sourceHandle: e.function,
        target: e.target,
        label: e.function,
        selected: selection?.kind === "edge" && selection.node === node.name && selection.function === e.function,
        type: "labelled",
      })),
  );
  return { nodes, edges };
}

/**
 * The canvas for a copilot draft: the draft's nodes and edges tagged added / changed, plus what the draft
 * dropped from `base` tagged removed. Positions of base nodes are reused, so only new nodes get laid out.
 * Returns the agent being drawn (draft plus removed items) so the Inspector can look items up in it.
 */
export function toReviewFlow(
  base: Agent, draft: Agent, basePositions: Record<string, Position>, selection: Selection = null,
): { nodes: CardNode[]; edges: FlowEdge[]; agent: Agent; positions: Record<string, Position> } {
  const diff = diffAgents(base, draft);
  const removedNodes = new Set(diff.removedNodes);
  const removedEdges = new Set(diff.removedEdges);
  const drafted = new Set(draft.nodes.map((n) => n.name));

  const keptRemoved = (n: AgentNode) =>
    (n.edges ?? []).filter((e) => removedEdges.has(edgeId(n.name, e.function)));
  const agent: Agent = {
    ...draft,
    nodes: [
      ...draft.nodes.map((n) => {
        const gone = keptRemoved(base.nodes.find((b) => b.name === n.name) ?? { name: n.name });
        return gone.length ? { ...n, edges: [...(n.edges ?? []), ...gone] } : n;
      }),
      ...base.nodes.filter((n) => removedNodes.has(n.name)),
    ],
  };
  const known = new Map(Object.entries(basePositions).filter(([name]) => drafted.has(name)));
  const positions = {
    ...Object.fromEntries(Object.entries(basePositions).filter(([name]) => removedNodes.has(name))),
    ...resolveLayout({ ...draft, layout: Object.fromEntries(known) }),
  };

  const changedNodes = new Set(diff.changedNodes.map((c) => c.name));
  const addedEdges = new Set(diff.addedEdges);
  const changedEdges = new Set(diff.changedEdges.map((c) => c.id));
  const flow = toFlow(agent, positions, selection);
  return {
    agent,
    positions,
    nodes: flow.nodes.map((n) => {
      const change: Change | undefined = removedNodes.has(n.id)
        ? "removed"
        : diff.addedNodes.includes(n.id)
          ? "added"
          : changedNodes.has(n.id)
            ? "changed"
            : undefined;
      return { ...n, data: { ...n.data, change } };
    }),
    edges: flow.edges.map((e) => {
      const change: Change | undefined = removedEdges.has(e.id)
        ? "removed"
        : addedEdges.has(e.id)
          ? "added"
          : changedEdges.has(e.id)
            ? "changed"
            : undefined;
      return { ...e, data: { change } };
    }),
  };
}
