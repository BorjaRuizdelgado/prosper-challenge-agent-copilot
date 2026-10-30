import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, Run } from "../model";
import { resetRunsStore, runPath, useRunsStore } from "./runsStore";
import { useAgentStore } from "../store";

const agent: Agent = {
  name: "A",
  initial_node: "greeting",
  nodes: [
    { name: "greeting", edges: [{ function: "book", description: "", target: "collect" }] },
    { name: "collect", edges: [{ function: "done", description: "", target: "bye" }] },
    { name: "bye", end: true },
  ],
};

const run = (id: string, path: Run["path"]): Run => ({
  id, started_at: "2026-10-21T09:14:00Z", duration_s: 30, outcome: "completed", transcript: [], path,
});

beforeEach(() => {
  resetRunsStore();
  vi.unstubAllGlobals();
});

describe("runsStore", () => {
  it("loads the runs of an agent", async () => {
    const runs = [run("r-1", [{ node: "greeting" }])];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(runs))));
    const loading = useRunsStore.getState().load("a");
    expect(useRunsStore.getState().byAgent.a.status).toBe("loading");
    await loading;
    expect(useRunsStore.getState().byAgent.a).toEqual({ status: "ready", runs, error: null });
  });

  it("keeps the failure so the panel can offer Retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    await useRunsStore.getState().load("a");
    expect(useRunsStore.getState().byAgent.a).toMatchObject({ status: "error", error: "Could not load the runs (500)" });
  });

  it("selects and clears a run", () => {
    useRunsStore.getState().select("a", "r-1");
    expect(useRunsStore.getState().selected).toEqual({ agentId: "a", runId: "r-1" });
    useRunsStore.getState().clear();
    expect(useRunsStore.getState().selected).toBeNull();
  });
});

describe("runPath", () => {
  it("returns visited nodes, taken edges and the last node of a normal run", () => {
    const r = run("r", [{ node: "greeting" }, { node: "collect", via: "book" }, { node: "bye", via: "done" }]);
    expect(runPath(r, agent)).toEqual({
      nodes: ["greeting", "collect", "bye"], edges: ["greeting::book", "collect::done"], last: "bye", missing: [],
    });
  });

  it("marks where a stuck run ended", () => {
    const r = run("r", [{ node: "greeting" }, { node: "collect", via: "book" }]);
    expect(runPath(r, agent)).toMatchObject({ nodes: ["greeting", "collect"], edges: ["greeting::book"], last: "collect" });
  });

  it("lists removed nodes as missing and draws only what exists", () => {
    const r = run("r", [{ node: "greeting" }, { node: "old_step", via: "book" }, { node: "bye", via: "done" }]);
    expect(runPath(r, agent)).toEqual({ nodes: ["greeting", "bye"], edges: [], last: "bye", missing: ["old_step"] });
    const gone = run("r", [{ node: "greeting" }, { node: "old_step", via: "book" }]);
    expect(runPath(gone, agent)).toMatchObject({ last: null, missing: ["old_step"] });
  });

  it("skips an edge that was renamed", () => {
    const r = run("r", [{ node: "greeting" }, { node: "collect", via: "renamed" }]);
    expect(runPath(r, agent).edges).toEqual([]);
  });
});

describe("closing the open run", () => {
  it("clears it when the dock leaves the Runs tab, not when it arrives", () => {
    useAgentStore.setState({ agentId: "a", dockTab: "call" });
    useRunsStore.getState().select("a", "r-1");
    useAgentStore.getState().setDockTab("runs");
    expect(useRunsStore.getState().selected).toEqual({ agentId: "a", runId: "r-1" });
    useAgentStore.getState().setDockTab("call");
    expect(useRunsStore.getState().selected).toBeNull();
  });
});
