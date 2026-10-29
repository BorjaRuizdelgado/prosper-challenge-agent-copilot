import { useMemo } from "react";
import { create } from "zustand";
import * as api from "../api";
import { useCallStore } from "../call/callStore";
import { chatOf, useCopilotStore } from "../copilot/copilotStore";
import type { Agent, Run } from "../model";
import { edgeId } from "../model";
import { useAgentStore } from "../store";

export type RunsState = { status: "loading" | "ready" | "error"; runs: Run[]; error: string | null };

export interface RunsStore {
  byAgent: Record<string, RunsState>;
  /** The run open in the Runs tab, and the agent it belongs to. */
  selected: { agentId: string; runId: string } | null;
  load: (agentId: string) => Promise<void>;
  select: (agentId: string, runId: string) => void;
  /** Closes the open run (leaving the tab, switching agent). */
  clear: () => void;
}

export const useRunsStore = create<RunsStore>((set) => ({
  byAgent: {},
  selected: null,
  load: async (agentId) => {
    set((s) => ({ byAgent: { ...s.byAgent, [agentId]: { status: "loading", runs: [], error: null } } }));
    try {
      const runs = await api.listRuns(agentId);
      set((s) => ({ byAgent: { ...s.byAgent, [agentId]: { status: "ready", runs, error: null } } }));
    } catch (e) {
      const error = (e as Error).message || "Could not load the runs";
      set((s) => ({ byAgent: { ...s.byAgent, [agentId]: { status: "error", runs: [], error } } }));
    }
  },
  select: (agentId, runId) => set({ selected: { agentId, runId } }),
  clear: () => set({ selected: null }),
}));

export const resetRunsStore = () => useRunsStore.setState({ byAgent: {}, selected: null });

/** What a run did, set against the agent as it is now. */
export interface RunPath {
  /** Visited nodes that exist, in order of first visit. */
  nodes: string[];
  /** Ids (`node::function`) of the edges taken that still exist. */
  edges: string[];
  /** The node the run ended in; null when it no longer exists. */
  last: string | null;
  /** Path entries whose node is gone, in path order. */
  missing: string[];
}

export function runPath(run: Run, agent: Agent): RunPath {
  const byName = new Map(agent.nodes.map((n) => [n.name, n]));
  const nodes: string[] = [];
  const edges: string[] = [];
  const missing: string[] = [];
  run.path.forEach((step, i) => {
    if (!byName.has(step.node)) {
      missing.push(step.node);
      return;
    }
    if (!nodes.includes(step.node)) nodes.push(step.node);
    const from = run.path[i - 1]?.node;
    if (step.via && from && byName.get(from)?.edges?.some((e) => e.function === step.via)) {
      const id = edgeId(from, step.via);
      if (!edges.includes(id)) edges.push(id);
    }
  });
  const end = run.path[run.path.length - 1]?.node;
  return { nodes, edges, last: end && byName.has(end) ? end : null, missing };
}

/**
 * The path to draw on the canvas: the open run of the open agent. Nothing while a copilot review owns the
 * canvas or a call is in progress (copilot review > live call > run).
 */
export function useRunPath(): RunPath | null {
  const agentId = useAgentStore((s) => s.agentId);
  const agent = useAgentStore((s) => s.agent);
  const selected = useRunsStore((s) => s.selected);
  const run = useRunsStore((s) =>
    selected && selected.agentId === agentId ? s.byAgent[agentId]?.runs.find((r) => r.id === selected.runId) : undefined,
  );
  const reviewing = useCopilotStore((s) => chatOf(s.chats, agentId).review !== null);
  const calling = useCallStore((s) => s.activeNode !== null);
  return useMemo(() => (run && agent && !reviewing && !calling ? runPath(run, agent) : null), [run, agent, reviewing, calling]);
}
