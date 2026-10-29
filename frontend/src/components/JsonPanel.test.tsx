import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import type { Agent } from "../model";
import { useAgentStore } from "../store";
import { JsonPanel } from "./JsonPanel";

const agent = (): Agent => ({ name: "A", initial_node: "a", nodes: [{ name: "a", task_messages: [] }] });
const box = () => screen.getByLabelText("Agent JSON") as HTMLTextAreaElement;
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const state = () => useAgentStore.getState();

beforeEach(() => {
  useAgentStore.setState({ status: "ready", agent: agent(), positions: { a: { x: 5, y: 6 } }, labelOffsets: {}, selection: null, dirty: false });
  render(<JsonPanel />);
});

test("shows the working agent with its positions", () => {
  expect(JSON.parse(box().value)).toEqual({ ...agent(), layout: { a: { x: 5, y: 6 } } });
  expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
});

test("applying valid JSON with a new node updates the graph and marks it unsaved", async () => {
  const edited = { ...agent(), nodes: [...agent().nodes, { name: "b" }] };
  type(JSON.stringify(edited));
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));

  expect(state().agent!.nodes.map((n) => n.name)).toEqual(["a", "b"]);
  expect(state().positions).toHaveProperty("b");
  expect(state().dirty).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("malformed JSON shows the error with its line and leaves the graph alone", async () => {
  type('{\n  "name": "A",\n  "nodes": [,]\n}');
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));

  expect(screen.getByRole("alert")).toHaveTextContent(/^Line 3:/);
  expect(state().agent).toEqual(agent());
  expect(state().dirty).toBe(false);
  expect(box().value).toContain('"nodes": [,]');
});

test("JSON of the wrong shape is refused with a reason", async () => {
  type('{"name":"A","initial_node":"a"}');
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));

  expect(screen.getByRole("alert")).toHaveTextContent('"nodes" must be an array.');
  expect(state().agent).toEqual(agent());
});

test("discard returns to the current graph", async () => {
  type("garbage");
  await userEvent.click(screen.getByRole("button", { name: "Discard" }));

  expect(JSON.parse(box().value).name).toBe("A");
});
