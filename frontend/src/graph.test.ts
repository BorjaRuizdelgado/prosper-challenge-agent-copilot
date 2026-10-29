import { expect, test } from "vitest";
import { toFlow } from "./graph";
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
