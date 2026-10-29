import { expect, test } from "vitest";
import type { Agent } from "../model";
import { diffAgents, isEmptyDiff } from "./diffAgents";

const base: Agent = {
  name: "x",
  initial_node: "a",
  nodes: [
    {
      name: "a",
      task_messages: [{ role: "system", content: "Greet the caller." }],
      edges: [{ function: "go", description: "Move on.", target: "b", properties: { dob: { type: "string" } } }],
    },
    { name: "b", task_messages: [{ role: "system", content: "Say goodbye." }], end: true },
  ],
};

const clone = (): Agent => structuredClone(base);

test("identical agents give an empty diff", () => {
  const d = diffAgents(base, clone());
  expect(isEmptyDiff(d)).toBe(true);
});

test("an added node and its edge are listed", () => {
  const after = clone();
  after.nodes.push({ name: "c", edges: [{ function: "back", description: "", target: "a" }] });
  after.nodes[0].edges!.push({ function: "to_c", description: "", target: "c" });
  const d = diffAgents(base, after);
  expect(d.addedNodes).toEqual(["c"]);
  expect(d.addedEdges).toEqual(["a::to_c", "c::back"]);
  expect(d.removedNodes).toEqual([]);
});

test("a removed node and its edges are listed", () => {
  const after = clone();
  after.nodes = [{ ...after.nodes[0], edges: [] }];
  const d = diffAgents(base, after);
  expect(d.removedNodes).toEqual(["b"]);
  expect(d.removedEdges).toEqual(["a::go"]);
});

test("a changed task text is reported with before and after", () => {
  const after = clone();
  after.nodes[0].task_messages![0].content = "Greet warmly.";
  const d = diffAgents(base, after);
  expect(d.changedNodes).toEqual([
    { name: "a", fields: [{ field: "task", before: "Greet the caller.", after: "Greet warmly." }] },
  ]);
  expect(d.changedEdges).toEqual([]);
});

test("retargeting an edge is a change of that edge only", () => {
  const after = clone();
  after.nodes[0].edges![0].target = "a";
  const d = diffAgents(base, after);
  expect(d.changedEdges).toEqual([
    { id: "a::go", node: "a", function: "go", fields: [{ field: "target", before: "b", after: "a" }] },
  ]);
  expect(d.changedNodes).toEqual([]);
});

test("a changed property and a new end flag are reported by field", () => {
  const after = clone();
  after.nodes[0].edges![0].properties = { dob: { type: "string", description: "Date of birth" } };
  after.nodes[0].end = true;
  const d = diffAgents(base, after);
  expect(d.changedEdges[0].fields.map((f) => f.field)).toEqual(["properties"]);
  expect(d.changedNodes[0].fields.map((f) => f.field)).toEqual(["end"]);
});

test("a rename is one removed plus one added node", () => {
  const after = clone();
  after.nodes[1].name = "bye";
  const d = diffAgents(base, after);
  expect(d.removedNodes).toEqual(["b"]);
  expect(d.addedNodes).toEqual(["bye"]);
});

test("layout and an empty actions list are not changes", () => {
  const after = clone();
  after.layout = { a: { x: 1, y: 2 } };
  after.nodes[1].post_actions = [];
  expect(isEmptyDiff(diffAgents(base, after))).toBe(true);
});

test("a persona change counts as a changed setting", () => {
  const before = { name: "A", persona: "Be brief.", initial_node: "n", nodes: [{ name: "n", task_messages: [] }] } as Agent;
  const diff = diffAgents(before, { ...before, persona: "Speak formal Spanish." });
  expect(diff.changedSettings).toEqual([{ field: "persona", before: "Be brief.", after: "Speak formal Spanish." }]);
  expect(isEmptyDiff(diff)).toBe(false);
});
