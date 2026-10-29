import { create } from "zustand";
import * as api from "./api";
import { resolveLayout } from "./layout";
import type { Agent, Position } from "./model";

export type Selection = { kind: "node"; node: string } | { kind: "edge"; node: string; function: string } | null;

type Status = "idle" | "loading" | "ready" | "error";

export interface AgentState {
  agentId: string | null;
  status: Status;
  error: string | null;
  /** The working copy the canvas renders. */
  agent: Agent | null;
  /** Position of every node (saved or auto-laid-out). */
  positions: Record<string, Position>;
  selection: Selection;
  /** Active dock tab id (see dock registry). */
  dockTab: string;
  select: (selection: Selection) => void;
  setDockTab: (tab: string) => void;
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
  select: (selection) => set(selection ? { selection, dockTab: "inspector" } : { selection }),
  setDockTab: (dockTab) => set({ dockTab }),
  reset: () => set(empty),
}));
