import { beforeEach, expect, test } from "vitest";
import { connect, deleteEdges, NEW_EDGE_HANDLE, reconnect } from "./canvasActions";
import type { Agent } from "./model";
import { useAgentStore } from "./store";

const agent = (): Agent => ({
  name: "Scheduler",
  initial_node: "a",
  nodes: [
    { name: "a", edges: [{ function: "go", description: "d", target: "b" }] },
    { name: "b" },
    { name: "c" },
  ],
});

const edges = (node = "a") => useAgentStore.getState().agent!.nodes.find((n) => n.name === node)!.edges ?? [];

beforeEach(() => {
  useAgentStore.setState({ agentId: "s", status: "ready", agent: agent(), positions: {}, selection: null, dirty: false });
});

test("dragging from the new-edge handle adds and selects an edge", () => {
  connect({ source: "b", sourceHandle: NEW_EDGE_HANDLE, target: "c" });

  expect(edges("b")).toEqual([{ function: "to_c", description: "Go to c.", target: "c" }]);
  expect(useAgentStore.getState().selection).toEqual({ kind: "edge", node: "b", function: "to_c" });
});

test.each(["top", "right", "bottom"])("dragging from the %s new-edge handle adds an edge", (side) => {
  connect({ source: "b", sourceHandle: `${NEW_EDGE_HANDLE}_${side}`, target: "c" });

  expect(edges("b")).toHaveLength(1);
});

test("dragging from the plain left handle adds an edge", () => {
  connect({ source: "b", sourceHandle: null, target: "c" });

  expect(edges("b")).toHaveLength(1);
});

test("dragging from an existing edge's handle retargets it", () => {
  connect({ source: "a", sourceHandle: "go", target: "c" });

  expect(edges()).toHaveLength(1);
  expect(edges()[0].target).toBe("c");
});

test("dragging an edge end to another node retargets it", () => {
  reconnect({ source: "a", sourceHandle: "go", target: "b" }, { source: "a", sourceHandle: "go", target: "c" });

  expect(edges()[0].target).toBe("c");
});

test("moving the source end of an edge is ignored", () => {
  reconnect({ source: "a", sourceHandle: "go", target: "b" }, { source: "b", sourceHandle: NEW_EDGE_HANDLE, target: "b" });

  expect(edges()[0].target).toBe("b");
  expect(useAgentStore.getState().dirty).toBe(false);
});

test("deleting edges removes them from the agent", () => {
  deleteEdges([{ source: "a", sourceHandle: "go" }]);

  expect(edges()).toEqual([]);
});
