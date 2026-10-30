import { useMemo } from "react";
import { create } from "zustand";
import { useCallStore } from "../call/callStore";
import { chatOf, getReplayStreamer, useCopilotStore } from "../copilot/copilotStore";
import type { Agent } from "../model";
import { type RunPath, runPath, useRunPath, useRunsStore } from "../runs/runsStore";
import { useAgentStore } from "../store";
import type { ReplayResult } from "./client";

/** A *Replay this call* in progress or finished: one run against the working copy. */
export interface WorkingReplay {
  agentId: string;
  runId: string;
  status: "running" | "done" | "error";
  result?: ReplayResult;
  error?: { message: string; setup: boolean };
}

export interface ReplayViewStore {
  /** The replay-card row that is open: its *after* transcript is shown and its path is drawn on the proposal. */
  row: { agentId: string; index: number; runId: string } | null;
  /** The single-call replay of the open run against the working copy. */
  working: WorkingReplay | null;
  /** Opens a row (putting its proposal on the canvas) or closes it when it is the open one. */
  toggleRow: (agentId: string, index: number, runId: string) => void;
  closeRow: () => void;
  /** Replays `runId` against `agent` (the working copy), before only. */
  replayWorking: (agentId: string, agent: Agent, runId: string) => Promise<void>;
  clearWorking: () => void;
}

let controller: AbortController | null = null;

export const useReplayView = create<ReplayViewStore>((set, get) => ({
  row: null,
  working: null,
  toggleRow: (agentId, index, runId) => {
    const open = get().row;
    if (open && open.agentId === agentId && open.index === index && open.runId === runId) return set({ row: null });
    useCopilotStore.getState().showReview(agentId, index);
    set({ row: { agentId, index, runId } });
  },
  closeRow: () => set({ row: null }),
  replayWorking: async (agentId, agent, runId) => {
    controller?.abort();
    const mine = (controller = new AbortController());
    set({ working: { agentId, runId, status: "running" } });
    const update = (w: Partial<WorkingReplay>) => !mine.signal.aborted && set((s) => ({ working: s.working && { ...s.working, ...w } }));
    let got = false;
    try {
      for await (const e of getReplayStreamer()(agentId, agent, null, [runId], mine.signal)) {
        if (mine.signal.aborted) return;
        if (e.event === "result") {
          const { run_id: _r, version: _v, event: _e, ...result } = e;
          got = true;
          update({ status: "done", result });
        } else if (e.event === "error") {
          got = true;
          update({ status: "error", error: { message: e.message, setup: !!e.setup } });
        } else if (e.event === "done") break;
      }
      if (!got) update({ status: "error", error: { message: "The replay ended without a result.", setup: false } });
    } catch (err) {
      update({ status: "error", error: { message: (err as Error).message || "The replay failed.", setup: false } });
    }
  },
  clearWorking: () => {
    controller?.abort();
    controller = null;
    set({ working: null });
  },
}));

// A single-call replay belongs to the run that is open; closing it or opening another drops the replay.
useRunsStore.subscribe((s) => {
  const w = useReplayView.getState().working;
  if (w && (s.selected?.agentId !== w.agentId || s.selected.runId !== w.runId)) useReplayView.getState().clearWorking();
});
useAgentStore.subscribe((s, prev) => {
  if (s.agentId !== prev.agentId) {
    useReplayView.getState().closeRow();
    useReplayView.getState().clearWorking();
  }
});

export const resetReplayView = () => {
  useReplayView.getState().clearWorking();
  useReplayView.setState({ row: null });
};

/**
 * The replay path to draw on the canvas, or null: an open card row (on the pending proposal while it is on the canvas)
 * or the open run's working-copy replay (while no copilot draft and no call owns the canvas).
 */
export function useReplayPath(): RunPath | null {
  const agentId = useAgentStore((s) => s.agentId);
  const agent = useAgentStore((s) => s.agent);
  const row = useReplayView((s) => s.row);
  const working = useReplayView((s) => s.working);
  const chat = useCopilotStore((s) => chatOf(s.chats, agentId));
  const calling = useCallStore((s) => s.activeNode !== null);
  return useMemo(() => {
    if (!agentId || !agent) return null;
    if (row && row.agentId === agentId) {
      const m = chat.messages[row.index];
      const after = m?.role === "assistant" ? m.replay?.runs[row.runId]?.after : undefined;
      const proposal = m?.role === "assistant" ? m.proposal : undefined;
      if (after && proposal && chat.review?.agent === proposal.agent) return runPath(after, proposal.agent);
    }
    if (working?.result && working.agentId === agentId && !chat.review && !calling) return runPath(working.result, agent);
    return null;
  }, [agentId, agent, row, working, chat, calling]);
}

/** What the canvas highlights: a replay's path when there is one, else the open run's. */
export function useCanvasPath(): RunPath | null {
  const replayed = useReplayPath();
  const run = useRunPath();
  return replayed ?? run;
}
