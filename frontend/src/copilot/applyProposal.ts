import { type Agent, edgeId, isEdgeKey, type Position } from "../model";
import { useAgentStore } from "../store";
import type { Proposal } from "./copilotStore";

/** True when the working copy differs from the one a proposal was made from (layout is not compared). */
export function isStale(base: Agent, current: Agent): boolean {
  const { layout: _a, ...a } = base;
  const { layout: _b, ...b } = current;
  return JSON.stringify(a) !== JSON.stringify(b);
}

/**
 * The proposal with the editor's current positions and label offsets as its layout, minus the entries of
 * nodes and edges it removed. Nodes without an entry (the new ones) are laid out by `replaceAgent`.
 */
export function withCurrentLayout(proposal: Agent, positions: Record<string, Position>, labelOffsets: Record<string, Position>): Agent {
  const nodes = new Set(proposal.nodes.map((n) => n.name));
  const edges = new Set(proposal.nodes.flatMap((n) => (n.edges ?? []).map((e) => edgeId(n.name, e.function))));
  const layout = Object.fromEntries(Object.entries({ ...positions, ...labelOffsets }).filter(([key]) => (isEdgeKey(key) ? edges.has(key) : nodes.has(key))));
  return { ...proposal, layout };
}

/** True when the editor's working copy changed since the proposal was made. */
export function isProposalStale(proposal: Proposal): boolean {
  const current = useAgentStore.getState().agent;
  return !!current && isStale(proposal.base, current);
}

/** Loads the proposal into the editor as unsaved changes, keeping the positions the user has. */
export function applyProposalToEditor(proposal: Proposal): void {
  const { positions, labelOffsets, replaceAgent } = useAgentStore.getState();
  replaceAgent(withCurrentLayout(proposal.agent, positions, labelOffsets));
}
