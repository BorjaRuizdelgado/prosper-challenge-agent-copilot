import { expect, test } from "vitest";
import type { Agent } from "../model";
import { isStale, withCurrentLayout } from "./applyProposal";

const agent: Agent = {
  name: "x",
  initial_node: "a",
  nodes: [{ name: "a", edges: [{ function: "go", description: "", target: "b" }] }, { name: "b" }],
};

test("stale ignores layout but sees any other change", () => {
  expect(isStale(agent, { ...agent, layout: { a: { x: 1, y: 1 } } })).toBe(false);
  expect(isStale(agent, { ...agent, name: "y" })).toBe(true);
});

test("layout keeps the editor's positions and drops removed nodes and edges", () => {
  const proposal: Agent = { ...agent, nodes: [{ name: "a", edges: [] }, { name: "c" }] };
  const merged = withCurrentLayout(proposal, { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }, { "a::go": { x: 5, y: 6 } });
  expect(merged.layout).toEqual({ a: { x: 1, y: 2 } });
});
