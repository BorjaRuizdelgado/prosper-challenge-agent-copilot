import { describe, expect, it, test } from "vitest";
import { toFlow, toReviewFlow } from "./graph";
import type { Agent } from "./model";

const agent: Agent = {
  name: "x",
  initial_node: "a",
  nodes: [
    { name: "a", edges: [{ function: "go", description: "", target: "b" }, { function: "bad", description: "", target: "zzz" }] },
    { name: "b", end: true },
  ],
};

test("nodes carry position and initial mark; edges are labelled by function", () => {
  const { nodes, edges } = toFlow(agent, { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } });

  expect(nodes.map((n) => [n.id, n.position, n.data.initial])).toEqual([
    ["a", { x: 1, y: 2 }, true],
    ["b", { x: 3, y: 4 }, false],
  ]);
  expect(edges).toHaveLength(1);
  expect(edges[0]).toMatchObject({ source: "a", sourceHandle: "go", target: "b", label: "go" });
});

describe("toReviewFlow", () => {
  const before: Agent = {
    name: "x",
    initial_node: "a",
    nodes: [
      { name: "a", task_messages: [{ role: "system", content: "Hi" }], edges: [{ function: "go", description: "", target: "b" }, { function: "old", description: "", target: "b" }] },
      { name: "b", edges: [{ function: "next", description: "", target: "gone" }] },
      { name: "gone" },
    ],
  };
  const after: Agent = {
    ...before,
    nodes: [
      { name: "a", task_messages: [{ role: "system", content: "Hello" }], edges: [{ function: "go", description: "", target: "b" }, { function: "more", description: "", target: "c" }] },
      { name: "b" },
      { name: "c" },
    ],
  };
  const basePositions = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, gone: { x: 5, y: 6 } };

  it("tags nodes and edges like diffAgents and draws removed ones from the base", () => {
    const { nodes, edges } = toReviewFlow(before, after, basePositions);
    expect(Object.fromEntries(nodes.map((n) => [n.id, n.data.change]))).toEqual({ a: "changed", b: undefined, c: "added", gone: "removed" });
    const tag = Object.fromEntries(edges.map((e) => [e.id, e.data?.change]));
    expect(tag).toMatchObject({ "a::more": "added", "a::old": "removed", "b::next": "removed", "a::go": undefined });
  });

  it("keeps base positions for nodes that stay or go, across successive drafts", () => {
    const first = toReviewFlow(before, after, basePositions);
    const second = toReviewFlow(before, { ...after, nodes: [...after.nodes, { name: "d" }] }, basePositions);
    for (const flow of [first, second]) {
      expect(flow.positions.a).toEqual({ x: 1, y: 2 });
      expect(flow.positions.b).toEqual({ x: 3, y: 4 });
      expect(flow.positions.gone).toEqual({ x: 5, y: 6 });
    }
    expect(second.positions.c).toBeDefined();
  });
});
