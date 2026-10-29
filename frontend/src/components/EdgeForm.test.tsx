import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import type { Agent } from "../model";
import { useAgentStore } from "../store";
import { Inspector } from "./Inspector";

const agent = (): Agent => ({
  name: "Scheduler",
  initial_node: "greeting",
  nodes: [
    {
      name: "greeting",
      task_messages: [],
      edges: [
        { function: "choose", description: "Pick one.", target: "confirm" },
        { function: "other", description: "d", target: "confirm" },
      ],
    },
    { name: "confirm", task_messages: [], end: true },
  ],
});

const edge = (fn = "choose") =>
  useAgentStore.getState().agent!.nodes[0].edges!.find((e) => e.function === fn)!;

beforeEach(() => {
  useAgentStore.setState({
    status: "ready",
    agent: agent(),
    positions: {},
    selection: { kind: "edge", node: "greeting", function: "choose" },
    dirty: false,
  });
  render(<Inspector />);
});

test("edits the description and retargets from the select", async () => {
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Pick a time." } });
  await userEvent.selectOptions(screen.getByLabelText("Target"), "greeting");

  expect(edge()).toMatchObject({ description: "Pick a time.", target: "greeting" });
  expect(useAgentStore.getState().dirty).toBe(true);
});

test("renames the function on blur and keeps the edge selected", async () => {
  const input = screen.getByLabelText("Function");
  await userEvent.clear(input);
  await userEvent.type(input, "pick_slot");
  await userEvent.tab();

  expect(edge("pick_slot")).toBeDefined();
  expect(useAgentStore.getState().selection).toEqual({ kind: "edge", node: "greeting", function: "pick_slot" });
});

test.each([
  ["", "An edge needs a function name."],
  ["other", "Another edge on this node already uses this name."],
])("a rejected function name %j shows %j", async (name, message) => {
  const input = screen.getByLabelText("Function");
  await userEvent.clear(input);
  if (name) await userEvent.type(input, name);
  await userEvent.tab();

  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(useAgentStore.getState().agent).toEqual(agent());
});

test("a required string parameter with allowed values writes properties and required", async () => {
  await userEvent.click(screen.getByRole("button", { name: "Add parameter" }));

  const name = screen.getByLabelText("Name of parameter param");
  await userEvent.clear(name);
  await userEvent.type(name, "full_name");
  await userEvent.tab();
  fireEvent.change(screen.getByLabelText("Description of full_name"), { target: { value: "Caller's name" } });
  await userEvent.click(screen.getByLabelText("Required"));

  expect(edge()).toMatchObject({
    properties: { full_name: { type: "string", description: "Caller's name" } },
    required: ["full_name"],
  });

  await userEvent.type(screen.getByLabelText("Allowed values of full_name"), "a, b ,");
  expect(edge().properties!.full_name.enum).toEqual(["a", "b"]);
});

test("changes the type, renames keeping required, and removes a parameter", async () => {
  await userEvent.click(screen.getByRole("button", { name: "Add parameter" }));
  await userEvent.click(screen.getByLabelText("Required"));
  await userEvent.selectOptions(screen.getByLabelText("Type of param"), "integer");
  expect(edge().properties!.param.type).toBe("integer");

  const name = screen.getByLabelText("Name of parameter param");
  await userEvent.clear(name);
  await userEvent.type(name, "age");
  await userEvent.tab();
  expect(Object.keys(edge().properties!)).toEqual(["age"]);
  expect(edge().required).toEqual(["age"]);

  await userEvent.click(screen.getByRole("button", { name: "Remove parameter age" }));
  expect(edge().properties).toEqual({});
  expect(edge().required).toEqual([]);
});

test("a duplicate parameter name is refused", async () => {
  await userEvent.click(screen.getByRole("button", { name: "Add parameter" }));
  await userEvent.click(screen.getByRole("button", { name: "Add parameter" }));

  const second = screen.getByLabelText("Name of parameter param_2");
  await userEvent.clear(second);
  await userEvent.type(second, "param");
  await userEvent.tab();

  expect(screen.getByRole("alert")).toHaveTextContent("Another parameter already has this name.");
  expect(Object.keys(edge().properties!)).toEqual(["param", "param_2"]);
});

test("deletes the edge", async () => {
  await userEvent.click(screen.getByRole("button", { name: "Delete edge" }));

  expect(useAgentStore.getState().agent!.nodes[0].edges!.map((e) => e.function)).toEqual(["other"]);
  expect(useAgentStore.getState().selection).toBeNull();
});
