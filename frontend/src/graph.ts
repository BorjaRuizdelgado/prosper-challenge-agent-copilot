import type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";
import type { Agent, AgentNode, Position } from "./model";
import { edgeId } from "./model";

export type CardData = { node: AgentNode; initial: boolean; [key: string]: unknown };
export type CardNode = FlowNode<CardData, "card">;

/** React Flow nodes/edges derived from the agent document. */
export function toFlow(agent: Agent, positions: Record<string, Position>): { nodes: CardNode[]; edges: FlowEdge[] } {
  const known = new Set(agent.nodes.map((n) => n.name));
  const nodes: CardNode[] = agent.nodes.map((node) => ({
    id: node.name,
    type: "card",
    position: positions[node.name] ?? { x: 0, y: 0 },
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
        type: "default",
      })),
  );
  return { nodes, edges };
}
