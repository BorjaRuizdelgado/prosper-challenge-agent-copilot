import { useAgentStore } from "./store";

/** Id of the handle on every card that starts a brand-new edge. */
export const NEW_EDGE_HANDLE = "__new";

interface Link {
  source: string;
  sourceHandle?: string | null;
  target: string;
}

/** Dragging from the "new edge" handle adds an edge; dragging from an existing edge's handle retargets it. */
export function connect({ source, sourceHandle, target }: Link) {
  const { addEdge, retargetEdge } = useAgentStore.getState();
  if (!sourceHandle || sourceHandle === NEW_EDGE_HANDLE) addEdge(source, target);
  else retargetEdge(source, sourceHandle, target);
}

/** Dragging the loose end of an edge onto another node retargets it; the source end stays put. */
export function reconnect(old: Link, next: Link) {
  if (old.source !== next.source || old.sourceHandle !== next.sourceHandle) return;
  useAgentStore.getState().retargetEdge(old.source, old.sourceHandle!, next.target);
}

export function deleteEdges(edges: { source: string; sourceHandle?: string | null }[]) {
  const { removeEdge } = useAgentStore.getState();
  edges.forEach((e) => e.sourceHandle && removeEdge(e.source, e.sourceHandle));
}
