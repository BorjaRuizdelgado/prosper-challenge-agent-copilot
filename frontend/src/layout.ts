import dagre from "@dagrejs/dagre";
import type { Agent, Position } from "./model";

export const NODE_WIDTH = 264;
export const NODE_HEIGHT = 124;
const EDGE_ROW = 28;

/** Card height grows with the number of outgoing edges (one handle row each). */
export const nodeHeight = (edgeCount: number) => NODE_HEIGHT + Math.max(0, edgeCount - 1) * EDGE_ROW;

/** Top-to-bottom dagre layout of every node. Returns top-left positions by node name. */
export function autoLayout(agent: Agent): Record<string, Position> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 72, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of agent.nodes) {
    g.setNode(n.name, { width: NODE_WIDTH, height: nodeHeight(n.edges?.length ?? 0) });
  }
  for (const n of agent.nodes) {
    for (const e of n.edges ?? []) {
      if (g.hasNode(e.target)) g.setEdge(n.name, e.target);
    }
  }
  dagre.layout(g);

  const positions: Record<string, Position> = {};
  for (const n of agent.nodes) {
    const { x, y, width, height } = g.node(n.name);
    positions[n.name] = { x: x - width / 2, y: y - height / 2 };
  }
  return positions;
}

/** Saved positions win; nodes without one get their auto-layout position. */
export function resolveLayout(agent: Agent): Record<string, Position> {
  const saved = agent.layout ?? {};
  const needsLayout = agent.nodes.some((n) => !saved[n.name]);
  const auto = needsLayout ? autoLayout(agent) : {};
  return Object.fromEntries(agent.nodes.map((n) => [n.name, saved[n.name] ?? auto[n.name]]));
}
