import { expect, test } from "vitest";
import { autoLayout, NODE_WIDTH, nodeHeight, resolveLayout } from "./layout";
import type { Agent } from "./model";

const edge = (function_: string, target: string) => ({ function: function_, description: "", target });

const agent: Agent = {
  name: "x",
  initial_node: "a",
  nodes: [
    { name: "a", edges: [edge("to_b", "b"), edge("to_c", "c")] },
    { name: "b", edges: [edge("to_d", "d")] },
    { name: "c", edges: [edge("to_d2", "d")] },
    { name: "d", end: true },
  ],
};

const rects = (agent: Agent, positions: ReturnType<typeof autoLayout>) =>
  agent.nodes.map((n) => ({ ...positions[n.name], w: NODE_WIDTH, h: nodeHeight(n.edges?.length ?? 0) }));

test("auto layout places every node without overlaps", () => {
  const r = rects(agent, autoLayout(agent));

  for (let i = 0; i < r.length; i++) {
    for (let j = i + 1; j < r.length; j++) {
      const apart =
        r[i].x + r[i].w <= r[j].x || r[j].x + r[j].w <= r[i].x || r[i].y + r[i].h <= r[j].y || r[j].y + r[j].h <= r[i].y;
      expect(apart, `${agent.nodes[i].name} overlaps ${agent.nodes[j].name}`).toBe(true);
    }
  }
});

test("auto layout flows top to bottom from the initial node", () => {
  const p = autoLayout(agent);

  expect(p.a.y).toBeLessThan(p.b.y);
  expect(p.b.y).toBeLessThan(p.d.y);
});

test("auto layout tolerates cycles and dangling targets", () => {
  const messy: Agent = {
    name: "x",
    initial_node: "a",
    nodes: [{ name: "a", edges: [edge("loop", "a"), edge("gone", "missing")] }],
  };

  expect(Object.keys(autoLayout(messy))).toEqual(["a"]);
});

test("saved positions are respected", () => {
  const saved = { ...agent, layout: { a: { x: 5, y: 7 }, b: { x: 1, y: 2 }, c: { x: 3, y: 4 }, d: { x: 9, y: 9 } } };

  expect(resolveLayout(saved)).toEqual(saved.layout);
});

test("nodes without a saved position are laid out around the saved ones", () => {
  const partial = { ...agent, layout: { a: { x: 500, y: 500 } } };
  const p = resolveLayout(partial);

  expect(p.a).toEqual({ x: 500, y: 500 });
  expect(Object.keys(p).sort()).toEqual(["a", "b", "c", "d"]);
  expect(p.b).toEqual(autoLayout(agent).b);
});
