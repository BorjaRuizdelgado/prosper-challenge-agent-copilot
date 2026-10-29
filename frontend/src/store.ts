import { create } from "zustand";
import * as api from "./api";
import { autoLayout, NODE_HEIGHT, resolveLayout } from "./layout";
import type { Agent, AgentNode, Edge, Position } from "./model";

export type Selection = { kind: "node"; node: string } | { kind: "edge"; node: string; function: string } | null;

type Status = "idle" | "loading" | "ready" | "error";
export type SaveStatus = "idle" | "saving" | "failed";

export type RenameResult = { ok: true } | { ok: false; reason: "blank" | "duplicate" | "unknown" };

/** Fields of a node that `updateNode` may change; the name goes through `renameNode`. */
export type NodePatch = Partial<Omit<AgentNode, "name">>;

export type EdgeResult = { ok: true } | { ok: false; reason: "blank" | "duplicate" | "unknown" };

/** Fields of an edge that `updateEdge` may change; the function name goes through `renameEdge`. */
export type EdgePatch = Partial<Omit<Edge, "function">>;

/** First `base`, `base_2`, `base_3`... not already used as a function name on the node. */
export function uniqueFunction(node: AgentNode, base: string): string {
  const used = new Set((node.edges ?? []).map((e) => e.function));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export type RemoveNodeResult = { ok: true } | { ok: false; reason: "unknown" | "initial" | "last" };

/** First `base`, `base_2`, `base_3`... not already used as a node name. */
export function uniqueNodeName(agent: Agent, base: string): string {
  const used = new Set(agent.nodes.map((n) => n.name));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

/** Edges from other nodes that point at `name`; these are the ones deleting it takes along. */
export function incomingEdgeCount(agent: Agent, name: string): number {
  return agent.nodes.filter((n) => n.name !== name).reduce((sum, n) => sum + (n.edges ?? []).filter((e) => e.target === name).length, 0);
}

/** True when the selected edge is one that points at `target`. */
function selectedEdgeTargets(agent: Agent, selection: NonNullable<Selection>, target: string): boolean {
  if (selection.kind !== "edge") return false;
  const edge = agent.nodes.find((n) => n.name === selection.node)?.edges?.find((e) => e.function === selection.function);
  return edge?.target === target;
}

export interface AgentState {
  agentId: string | null;
  status: Status;
  error: string | null;
  /** The working copy the canvas renders. */
  agent: Agent | null;
  /** Position of every node (saved or auto-laid-out). */
  positions: Record<string, Position>;
  /** Bumped by auto layout so the canvas refits its view to the new arrangement. */
  layoutRun: number;
  selection: Selection;
  /** True when the working copy differs from what was last loaded or saved. */
  dirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Active dock tab id (see dock registry). */
  dockTab: string;
  select: (selection: Selection) => void;
  setDockTab: (tab: string) => void;
  updateNode: (name: string, patch: NodePatch) => void;
  /** Renames a node and rewrites every reference to it; refuses blank or duplicate names. */
  renameNode: (from: string, to: string) => RenameResult;
  /** Adds an empty node with a unique name below the existing ones, selects it and returns its name. */
  addNode: () => string | null;
  /** Deletes a node and every edge targeting it; the initial node and the last node are protected. */
  removeNode: (name: string) => RemoveNodeResult;
  setInitialNode: (name: string) => void;
  /** Records where the user dragged a node; saved with the agent as its `layout`. */
  moveNode: (name: string, position: Position) => void;
  /** Discards every position and lays the whole graph out again. */
  autoLayout: () => void;
  /** Adds an edge from `from` to `target` with a unique function name, selects it and returns the name. */
  addEdge: (from: string, target: string) => string | null;
  updateEdge: (from: string, fn: string, patch: EdgePatch) => void;
  /** Renames an edge's function; refuses blank names and names already used on the same node. */
  renameEdge: (from: string, fn: string, to: string) => EdgeResult;
  removeEdge: (from: string, fn: string) => void;
  /** Points an existing edge at another node. */
  retargetEdge: (from: string, fn: string, target: string) => void;
  /** Persists the working copy with its positions; on failure it stays dirty so the user can retry. */
  save: () => Promise<boolean>;
  load: (id: string) => Promise<void>;
  reset: () => void;
}

const empty = {
  agentId: null,
  status: "idle" as Status,
  error: null,
  agent: null,
  positions: {},
  layoutRun: 0,
  selection: null as Selection,
  dirty: false,
  saveStatus: "idle" as SaveStatus,
  saveError: null as string | null,
  dockTab: "inspector",
};

export const useAgentStore = create<AgentState>((set, get) => ({
  ...empty,
  async load(id) {
    set({ ...empty, agentId: id, status: "loading" });
    try {
      const { agent } = await api.getAgent(id);
      if (get().agentId !== id) return; // user navigated elsewhere meanwhile
      set({ status: "ready", agent, positions: resolveLayout(agent) });
    } catch (e) {
      if (get().agentId !== id) return;
      set({ status: "error", error: (e as Error).message });
    }
  },
  updateNode(name, patch) {
    const { agent } = get();
    if (!agent || !agent.nodes.some((n) => n.name === name)) return;
    set({
      dirty: true,
      agent: { ...agent, nodes: agent.nodes.map((n) => (n.name === name ? { ...n, ...patch } : n)) },
    });
  },
  renameNode(from, raw) {
    const { agent, positions, selection } = get();
    const to = raw.trim();
    if (!agent || !agent.nodes.some((n) => n.name === from)) return { ok: false, reason: "unknown" };
    if (!to) return { ok: false, reason: "blank" };
    if (to === from) return { ok: true };
    if (agent.nodes.some((n) => n.name === to)) return { ok: false, reason: "duplicate" };

    const moved = (map?: Record<string, Position>) =>
      map && Object.fromEntries(Object.entries(map).map(([k, v]) => [k === from ? to : k, v]));
    set({
      dirty: true,
      agent: {
        ...agent,
        initial_node: agent.initial_node === from ? to : agent.initial_node,
        layout: moved(agent.layout),
        nodes: agent.nodes.map((n) => ({
          ...(n.name === from ? { ...n, name: to } : n),
          edges: n.edges?.map((e) => (e.target === from ? { ...e, target: to } : e)),
        })),
      },
      positions: moved(positions)!,
      selection: selection && selection.node === from ? { ...selection, node: to } : selection,
    });
    return { ok: true };
  },
  addEdge(from, target) {
    const { agent } = get();
    const node = agent?.nodes.find((n) => n.name === from);
    if (!agent || !node || !agent.nodes.some((n) => n.name === target)) return null;
    const fn = uniqueFunction(node, `to_${target}`);
    const edge: Edge = { function: fn, description: `Go to ${target}.`, target };
    set({
      dirty: true,
      agent: { ...agent, nodes: agent.nodes.map((n) => (n === node ? { ...n, edges: [...(n.edges ?? []), edge] } : n)) },
      selection: { kind: "edge", node: from, function: fn },
      dockTab: "inspector",
    });
    return fn;
  },
  updateEdge(from, fn, patch) {
    const { agent } = get();
    if (!agent) return;
    const known = agent.nodes.find((n) => n.name === from)?.edges?.some((e) => e.function === fn);
    if (!known || (patch.target !== undefined && !agent.nodes.some((n) => n.name === patch.target))) return;
    set({
      dirty: true,
      agent: {
        ...agent,
        nodes: agent.nodes.map((n) =>
          n.name === from ? { ...n, edges: n.edges!.map((e) => (e.function === fn ? { ...e, ...patch } : e)) } : n,
        ),
      },
    });
  },
  renameEdge(from, fn, raw) {
    const { agent, selection } = get();
    const to = raw.trim();
    const node = agent?.nodes.find((n) => n.name === from);
    if (!agent || !node?.edges?.some((e) => e.function === fn)) return { ok: false, reason: "unknown" };
    if (!to) return { ok: false, reason: "blank" };
    if (to === fn) return { ok: true };
    if (node.edges.some((e) => e.function === to)) return { ok: false, reason: "duplicate" };
    set({
      dirty: true,
      agent: {
        ...agent,
        nodes: agent.nodes.map((n) =>
          n === node ? { ...n, edges: n.edges!.map((e) => (e.function === fn ? { ...e, function: to } : e)) } : n,
        ),
      },
      selection:
        selection?.kind === "edge" && selection.node === from && selection.function === fn
          ? { ...selection, function: to }
          : selection,
    });
    return { ok: true };
  },
  removeEdge(from, fn) {
    const { agent, selection } = get();
    if (!agent?.nodes.find((n) => n.name === from)?.edges?.some((e) => e.function === fn)) return;
    set({
      dirty: true,
      agent: {
        ...agent,
        nodes: agent.nodes.map((n) =>
          n.name === from ? { ...n, edges: n.edges!.filter((e) => e.function !== fn) } : n,
        ),
      },
      selection: selection?.kind === "edge" && selection.node === from && selection.function === fn ? null : selection,
    });
  },
  retargetEdge(from, fn, target) {
    get().updateEdge(from, fn, { target });
  },
  addNode() {
    const { agent, positions } = get();
    if (!agent) return null;
    const name = uniqueNodeName(agent, "new_node");
    const spots = Object.values(positions);
    const position = spots.length
      ? { x: Math.min(...spots.map((p) => p.x)), y: Math.max(...spots.map((p) => p.y)) + NODE_HEIGHT + 48 }
      : { x: 0, y: 0 };
    set({
      dirty: true,
      agent: { ...agent, nodes: [...agent.nodes, { name, task_messages: [], edges: [] }] },
      positions: { ...positions, [name]: position },
      selection: { kind: "node", node: name },
      dockTab: "inspector",
    });
    return name;
  },
  removeNode(name) {
    const { agent, positions, selection } = get();
    if (!agent || !agent.nodes.some((n) => n.name === name)) return { ok: false, reason: "unknown" };
    if (agent.nodes.length === 1) return { ok: false, reason: "last" };
    if (agent.initial_node === name) return { ok: false, reason: "initial" };
    const without = <T,>(map?: Record<string, T>) => map && Object.fromEntries(Object.entries(map).filter(([k]) => k !== name));
    set({
      dirty: true,
      agent: {
        ...agent,
        layout: without(agent.layout),
        nodes: agent.nodes
          .filter((n) => n.name !== name)
          .map((n) => (n.edges?.some((e) => e.target === name) ? { ...n, edges: n.edges.filter((e) => e.target !== name) } : n)),
      },
      positions: without(positions)!,
      selection: selection && (selection.node === name || selectedEdgeTargets(agent, selection, name)) ? null : selection,
    });
    return { ok: true };
  },
  moveNode(name, position) {
    const { agent, positions } = get();
    const current = positions[name];
    if (!agent || !current || (current.x === position.x && current.y === position.y)) return;
    set({ dirty: true, positions: { ...positions, [name]: position } });
  },
  autoLayout() {
    const { agent } = get();
    if (!agent) return;
    set({ dirty: true, positions: autoLayout(agent), layoutRun: get().layoutRun + 1 });
  },
  setInitialNode(name) {
    const { agent } = get();
    if (!agent || agent.initial_node === name || !agent.nodes.some((n) => n.name === name)) return;
    set({ dirty: true, agent: { ...agent, initial_node: name } });
  },
  async save() {
    const { agentId, agent, positions, saveStatus } = get();
    if (!agentId || !agent || saveStatus === "saving") return false;
    set({ saveStatus: "saving", saveError: null });
    try {
      await api.saveAgent(agentId, { ...agent, layout: positions });
      if (get().agentId !== agentId) return true;
      // Edits made while the request was in flight are not saved yet, so only clear dirty if untouched.
      const untouched = get().agent === agent && get().positions === positions;
      set({ saveStatus: "idle", agent: untouched ? { ...agent, layout: positions } : get().agent, dirty: !untouched });
      return true;
    } catch (e) {
      if (get().agentId === agentId) set({ saveStatus: "failed", saveError: (e as Error).message });
      return false;
    }
  },
  select: (selection) => set(selection ? { selection, dockTab: "inspector" } : { selection }),
  setDockTab: (dockTab) => set({ dockTab }),
  reset: () => set(empty),
}));
