import { create } from "zustand";
import * as api from "./api";
import { resolveLayout } from "./layout";
import type { Agent, AgentNode, Position } from "./model";

export type Selection = { kind: "node"; node: string } | { kind: "edge"; node: string; function: string } | null;

type Status = "idle" | "loading" | "ready" | "error";

export type RenameResult = { ok: true } | { ok: false; reason: "blank" | "duplicate" | "unknown" };

/** Fields of a node that `updateNode` may change; the name goes through `renameNode`. */
export type NodePatch = Partial<Omit<AgentNode, "name">>;

export interface AgentState {
  agentId: string | null;
  status: Status;
  error: string | null;
  /** The working copy the canvas renders. */
  agent: Agent | null;
  /** Position of every node (saved or auto-laid-out). */
  positions: Record<string, Position>;
  selection: Selection;
  /** True when the working copy differs from what was last loaded or saved. */
  dirty: boolean;
  /** Active dock tab id (see dock registry). */
  dockTab: string;
  select: (selection: Selection) => void;
  setDockTab: (tab: string) => void;
  updateNode: (name: string, patch: NodePatch) => void;
  /** Renames a node and rewrites every reference to it; refuses blank or duplicate names. */
  renameNode: (from: string, to: string) => RenameResult;
  load: (id: string) => Promise<void>;
  reset: () => void;
}

const empty = {
  agentId: null,
  status: "idle" as Status,
  error: null,
  agent: null,
  positions: {},
  selection: null as Selection,
  dirty: false,
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
  select: (selection) => set(selection ? { selection, dockTab: "inspector" } : { selection }),
  setDockTab: (dockTab) => set({ dockTab }),
  reset: () => set(empty),
}));
