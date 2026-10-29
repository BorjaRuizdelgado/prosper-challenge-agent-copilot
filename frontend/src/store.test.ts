import { beforeEach, describe, expect, test } from "vitest";
import type { Agent } from "./model";
import { useAgentStore } from "./store";

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
