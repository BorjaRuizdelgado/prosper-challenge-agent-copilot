import { expect, test } from "vitest";
import { parseAgent } from "./agentJson";

const valid = { name: "A", initial_node: "a", nodes: [{ name: "a", edges: [{ function: "go", target: "a", description: "d" }] }] };

test("accepts a well-formed agent", () => {
  expect(parseAgent(JSON.stringify(valid))).toEqual({ ok: true, agent: valid });
});

test("reports the line of a syntax error", () => {
  const result = parseAgent('{\n  "name": "A",\n  "nodes": [,]\n}');

  expect(result).toMatchObject({ ok: false, line: 3 });
});

test.each([
  ["[]", "must be a JSON object"],
  ['{"initial_node":"a","nodes":[]}', '"name"'],
  ['{"name":"A","nodes":[]}', '"initial_node"'],
  ['{"name":"A","initial_node":"a"}', '"nodes"'],
  ['{"name":"A","initial_node":"a","nodes":[1]}', "nodes[0]"],
  ['{"name":"A","initial_node":"a","nodes":[{"name":"a","edges":{}}]}', "must be an array"],
  ['{"name":"A","initial_node":"a","nodes":[{"name":"a","edges":[{"function":"go"}]}]}', '"target"'],
])("rejects bad shape %s", (text, fragment) => {
  const result = parseAgent(text);

  expect(result.ok).toBe(false);
  expect(!result.ok && result.message).toContain(fragment);
});
