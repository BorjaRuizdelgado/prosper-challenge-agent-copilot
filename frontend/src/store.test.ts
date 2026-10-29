import { beforeEach, describe, expect, test } from "vitest";
import type { Agent } from "./model";
import { incomingEdgeCount, useAgentStore } from "./store";

const agent = (): Agent => ({
  name: "Scheduler",
  initial_node: "greeting",
  layout: { greeting: { x: 0, y: 0 }, confirm: { x: 400, y: 0 } },
  nodes: [
    {
      name: "greeting",
      task_messages: [{ role: "developer", content: "Greet." }],
      edges: [{ function: "choose", description: "d", target: "confirm" }],
    },
    { name: "confirm", task_messages: [], end: true, edges: [{ function: "back", description: "d", target: "confirm" }] },
  ],
});

const state = () => useAgentStore.getState();

beforeEach(() => {
  const a = agent();
  useAgentStore.setState({
    agentId: "s-1",
    status: "ready",
    agent: a,
    positions: { ...a.layout },
    selection: null,
    dirty: false,
  });
});

describe("updateNode", () => {
  test("patches only the named node and marks the agent dirty", () => {
    state().updateNode("confirm", { end: false, role_message: "Be brief." });

    expect(state().agent!.nodes[1]).toMatchObject({ name: "confirm", end: false, role_message: "Be brief." });
    expect(state().agent!.nodes[0]).toEqual(agent().nodes[0]);
    expect(state().dirty).toBe(true);
  });

  test("an unknown node changes nothing", () => {
    state().updateNode("nope", { end: true });

    expect(state().agent).toEqual(agent());
    expect(state().dirty).toBe(false);
  });
});

describe("renameNode", () => {
  test("cascades to edge targets, initial_node, layout, positions and selection", () => {
    state().select({ kind: "node", node: "greeting" });

    expect(state().renameNode("greeting", "hello")).toEqual({ ok: true });
    state().renameNode("confirm", "wrap-up");

    const a = state().agent!;
    expect(a.initial_node).toBe("hello");
    expect(a.nodes.map((n) => n.name)).toEqual(["hello", "wrap-up"]);
    expect(a.nodes[0].edges![0].target).toBe("wrap-up");
    expect(a.nodes[1].edges![0].target).toBe("wrap-up");
    expect(Object.keys(a.layout!)).toEqual(["hello", "wrap-up"]);
    expect(state().positions).toEqual({ hello: { x: 0, y: 0 }, "wrap-up": { x: 400, y: 0 } });
    expect(state().selection).toEqual({ kind: "node", node: "hello" });
    expect(state().dirty).toBe(true);
  });

  test("an edge selection follows the renamed source node", () => {
    state().select({ kind: "edge", node: "greeting", function: "choose" });
    state().renameNode("greeting", "hello");

    expect(state().selection).toEqual({ kind: "edge", node: "hello", function: "choose" });
  });

  test("trims the new name", () => {
    state().renameNode("greeting", "  hello ");

    expect(state().agent!.initial_node).toBe("hello");
  });

  test("refuses a duplicate name", () => {
    expect(state().renameNode("greeting", "confirm")).toEqual({ ok: false, reason: "duplicate" });

    expect(state().agent).toEqual(agent());
    expect(state().dirty).toBe(false);
  });

  test.each(["", "   "])("refuses a blank name %j", (name) => {
    expect(state().renameNode("greeting", name)).toEqual({ ok: false, reason: "blank" });
    expect(state().agent).toEqual(agent());
  });

  test("renaming to the same name is a no-op", () => {
    expect(state().renameNode("greeting", "greeting")).toEqual({ ok: true });
    expect(state().dirty).toBe(false);
  });

  test("an unknown node is refused", () => {
    expect(state().renameNode("nope", "x")).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("edge actions", () => {
  const edges = (name = "greeting") => state().agent!.nodes.find((n) => n.name === name)!.edges ?? [];

  test("addEdge appends an edge with a unique function name and selects it", () => {
    expect(state().addEdge("greeting", "confirm")).toBe("to_confirm");
    expect(state().addEdge("greeting", "confirm")).toBe("to_confirm_2");

    expect(edges().map((e) => e.function)).toEqual(["choose", "to_confirm", "to_confirm_2"]);
    expect(edges()[1]).toMatchObject({ target: "confirm" });
    expect(state().selection).toEqual({ kind: "edge", node: "greeting", function: "to_confirm_2" });
    expect(state().dirty).toBe(true);
  });

  test("addEdge ignores unknown source or target", () => {
    expect(state().addEdge("nope", "confirm")).toBeNull();
    expect(state().addEdge("greeting", "nope")).toBeNull();
    expect(state().agent).toEqual(agent());
    expect(state().dirty).toBe(false);
  });

  test("updateEdge patches description and parameters only on that edge", () => {
    state().updateEdge("greeting", "choose", { description: "New", properties: { name: { type: "string" } }, required: ["name"] });

    expect(edges()[0]).toMatchObject({ function: "choose", description: "New", required: ["name"] });
    expect(edges("confirm")).toEqual(agent().nodes[1].edges);
    expect(state().dirty).toBe(true);
  });

  test("renameEdge renames and keeps the selection; refuses blank and duplicate names", () => {
    state().addEdge("greeting", "confirm");
    state().select({ kind: "edge", node: "greeting", function: "choose" });

    expect(state().renameEdge("greeting", "choose", "pick")).toEqual({ ok: true });
    expect(edges().map((e) => e.function)).toEqual(["pick", "to_confirm"]);
    expect(state().selection).toEqual({ kind: "edge", node: "greeting", function: "pick" });

    expect(state().renameEdge("greeting", "pick", "  ")).toEqual({ ok: false, reason: "blank" });
    expect(state().renameEdge("greeting", "pick", "to_confirm")).toEqual({ ok: false, reason: "duplicate" });
    expect(state().renameEdge("greeting", "nope", "x")).toEqual({ ok: false, reason: "unknown" });
    expect(edges().map((e) => e.function)).toEqual(["pick", "to_confirm"]);
  });

  test("the same function name is allowed on different nodes", () => {
    expect(state().renameEdge("greeting", "choose", "back")).toEqual({ ok: true });
    expect(edges("confirm")[0].function).toBe("back");
  });

  test("removeEdge deletes the edge and clears its selection", () => {
    state().select({ kind: "edge", node: "greeting", function: "choose" });
    state().removeEdge("greeting", "choose");

    expect(edges()).toEqual([]);
    expect(state().selection).toBeNull();
    expect(state().dirty).toBe(true);
  });

  test("retargetEdge points the edge at another node and refuses unknown targets", () => {
    state().retargetEdge("greeting", "choose", "greeting");
    expect(edges()[0].target).toBe("greeting");

    state().retargetEdge("greeting", "choose", "nope");
    expect(edges()[0].target).toBe("greeting");
  });
});

describe("addNode", () => {
  test("adds an empty node with a unique name below the others, selects it and marks dirty", () => {
    expect(state().addNode()).toBe("new_node");
    expect(state().addNode()).toBe("new_node_2");

    const a = state().agent!;
    expect(a.nodes.map((n) => n.name)).toEqual(["greeting", "confirm", "new_node", "new_node_2"]);
    expect(a.nodes[2]).toEqual({ name: "new_node", task_messages: [], edges: [] });
    expect(state().positions.new_node.y).toBeGreaterThan(state().positions.greeting.y);
    expect(state().positions.new_node_2.y).toBeGreaterThan(state().positions.new_node.y);
    expect(state().selection).toEqual({ kind: "node", node: "new_node_2" });
    expect(state().dirty).toBe(true);
  });
});

describe("removeNode", () => {
  test("removes the node, edges targeting it, its layout and its selection", () => {
    state().select({ kind: "edge", node: "greeting", function: "choose" });

    expect(state().removeNode("confirm")).toEqual({ ok: true });

    const a = state().agent!;
    expect(a.nodes.map((n) => n.name)).toEqual(["greeting"]);
    expect(a.nodes[0].edges).toEqual([]);
    expect(a.layout).toEqual({ greeting: { x: 0, y: 0 } });
    expect(state().positions).toEqual({ greeting: { x: 0, y: 0 } });
    expect(state().selection).toBeNull();
    expect(state().dirty).toBe(true);
  });

  test("refuses the initial node while others exist", () => {
    expect(state().removeNode("greeting")).toEqual({ ok: false, reason: "initial" });

    expect(state().agent).toEqual(agent());
    expect(state().dirty).toBe(false);
  });

  test("the initial node can go once another is chosen", () => {
    state().setInitialNode("confirm");

    expect(state().removeNode("greeting")).toEqual({ ok: true });
    expect(state().agent!.initial_node).toBe("confirm");
  });

  test("refuses the only node and unknown nodes", () => {
    state().removeNode("confirm");
    state().setInitialNode("greeting");

    expect(state().removeNode("greeting")).toEqual({ ok: false, reason: "last" });
    expect(state().removeNode("nope")).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("incomingEdgeCount", () => {
  test("counts edges from other nodes only", () => {
    // confirm -> confirm is its own edge and goes with the node anyway
    expect(incomingEdgeCount(agent(), "confirm")).toBe(1);
    expect(incomingEdgeCount(agent(), "greeting")).toBe(0);
  });
});

describe("setInitialNode", () => {
  test("changes the initial node and marks dirty; unknown names are ignored", () => {
    state().setInitialNode("nope");
    expect(state().dirty).toBe(false);

    state().setInitialNode("confirm");
    expect(state().agent!.initial_node).toBe("confirm");
    expect(state().dirty).toBe(true);
  });
});
