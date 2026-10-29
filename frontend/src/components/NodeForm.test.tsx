import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
      task_messages: [
        { role: "developer", content: "Greet." },
        { role: "developer", content: "Ask why they call." },
      ],
      edges: [{ function: "choose", description: "d", target: "confirm" }],
    },
    { name: "confirm", task_messages: [] },
  ],
});

const node = (name = "greeting") => useAgentStore.getState().agent!.nodes.find((n) => n.name === name)!;

beforeEach(() => {
  useAgentStore.setState({
    status: "ready",
    agent: agent(),
    positions: {},
    selection: { kind: "node", node: "greeting" },
    dirty: false,
  });
  render(<Inspector />);
});

test("renaming commits on blur and cascades to edge targets", async () => {
  act(() => useAgentStore.getState().select({ kind: "node", node: "confirm" }));
  const input = screen.getByLabelText("Name");
  await userEvent.clear(input);
  await userEvent.type(input, "wrap-up");
  await userEvent.tab();

  expect(useAgentStore.getState().agent!.nodes.map((n) => n.name)).toEqual(["greeting", "wrap-up"]);
  expect(node().edges![0].target).toBe("wrap-up");
});

test.each([
  ["", "A node needs a name."],
  ["confirm", "Another node already has this name."],
])("a rejected name %j shows %j and leaves the agent alone", async (name, message) => {
  const input = screen.getByLabelText("Name");
  await userEvent.clear(input);
  if (name) await userEvent.type(input, name);
  await userEvent.tab();

  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(useAgentStore.getState().agent).toEqual(agent());
});

test("edits message content and role", async () => {
  fireEvent.change(screen.getByLabelText("Content of message 1"), { target: { value: "Hello!" } });
  await userEvent.selectOptions(screen.getByLabelText("Role of message 2"), "system");

  expect(node().task_messages).toEqual([
    { role: "developer", content: "Hello!" },
    { role: "system", content: "Ask why they call." },
  ]);
  expect(useAgentStore.getState().dirty).toBe(true);
});

test("adds, reorders and removes messages", async () => {
  await userEvent.click(screen.getByRole("button", { name: "Add message" }));
  expect(node().task_messages).toHaveLength(3);

  await userEvent.click(screen.getByRole("button", { name: "Move message 2 up" }));
  expect(node().task_messages!.map((m) => m.content)).toEqual(["Ask why they call.", "Greet.", ""]);
  expect(screen.getByRole("button", { name: "Move message 1 up" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move message 3 down" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Remove message 3" }));
  await userEvent.click(screen.getByRole("button", { name: "Remove message 1" }));
  expect(node().task_messages).toEqual([{ role: "developer", content: "Greet." }]);
});

test("toggles the terminal flag and sets or clears the role override", async () => {
  await userEvent.click(screen.getByLabelText("Ends the call"));
  expect(node().end).toBe(true);

  fireEvent.change(screen.getByLabelText("Role override"), { target: { value: "Be brief." } });
  expect(node().role_message).toBe("Be brief.");
  fireEvent.change(screen.getByLabelText("Role override"), { target: { value: "" } });
  expect(node().role_message).toBeNull();
});

test("pre-actions are added, edited and removed as Say / End call steps", async () => {
  const pre = within(screen.getByRole("group", { name: "Pre-actions" }));
  await userEvent.click(pre.getByRole("button", { name: "Add say" }));
  expect(node().pre_actions).toEqual([{ type: "tts_say" }]);

  fireEvent.change(pre.getByLabelText("Text of pre-actions step 1"), { target: { value: "One moment." } });
  expect(node().pre_actions).toEqual([{ type: "tts_say", text: "One moment." }]);

  // Unticking writes the non-default false; ticking again drops the key so the JSON stays minimal.
  await userEvent.click(pre.getByLabelText("Add to the conversation history"));
  expect(node().pre_actions![0].append_text_to_context).toBe(false);
  await userEvent.click(pre.getByLabelText("Add to the conversation history"));
  expect(node().pre_actions![0]).not.toHaveProperty("append_text_to_context");

  await userEvent.selectOptions(pre.getByLabelText("Type of pre-actions step 1"), "End call");
  expect(node().pre_actions).toEqual([{ type: "end_conversation", text: "One moment." }]);

  await userEvent.click(pre.getByRole("button", { name: "Remove pre-actions step 1" }));
  expect(node().pre_actions).toEqual([]);
});

test("unsupported actions are shown read-only and can be removed", async () => {
  act(() => useAgentStore.getState().updateNode("greeting", { post_actions: [{ type: "function" }] }));
  const post = within(screen.getByRole("group", { name: "Post-actions" }));
  expect(post.getByText('{"type":"function"}')).toBeInTheDocument();
  expect(post.getByText(/Not an action the agent can run/)).toBeInTheDocument();
  await userEvent.click(post.getByRole("button", { name: "Remove post-actions step 1" }));
  expect(node().post_actions).toEqual([]);
});

test("a terminal node warns when its post-actions replace the automatic hang-up", async () => {
  act(() => useAgentStore.getState().updateNode("greeting", { end: true }));
  const post = within(screen.getByRole("group", { name: "Post-actions" }));
  expect(post.getByText(/the call hangs up after the agent's reply/)).toBeInTheDocument();

  await userEvent.click(post.getByRole("button", { name: "Add say" }));
  expect(post.getByRole("alert")).toHaveTextContent("replace the automatic hang-up");

  await userEvent.click(post.getByRole("button", { name: "Add end call" }));
  expect(post.queryByRole("alert")).toBeNull();
});

test("deleting a targeted node states how many edges go and removes them on confirm", async () => {
  act(() => useAgentStore.getState().select({ kind: "node", node: "confirm" }));

  await userEvent.click(screen.getByRole("button", { name: "Delete node" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("1 edge leads here and will be removed too.");

  await userEvent.click(screen.getAllByRole("button", { name: "Delete node" }).at(-1)!);

  expect(useAgentStore.getState().agent!.nodes.map((n) => n.name)).toEqual(["greeting"]);
  expect(node().edges).toEqual([]);
});

test("cancelling the delete confirmation keeps the node", async () => {
  act(() => useAgentStore.getState().select({ kind: "node", node: "confirm" }));

  await userEvent.click(screen.getByRole("button", { name: "Delete node" }));
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(useAgentStore.getState().agent!.nodes).toHaveLength(2);
});

test("the initial node cannot be deleted until another is set as initial", async () => {
  expect(screen.getByRole("button", { name: "Delete node" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Initial node" })).toBeDisabled();
  expect(screen.getByText(/Set another node as initial before deleting it/)).toBeInTheDocument();

  act(() => useAgentStore.getState().select({ kind: "node", node: "confirm" }));
  await userEvent.click(screen.getByRole("button", { name: "Set as initial" }));
  expect(useAgentStore.getState().agent!.initial_node).toBe("confirm");

  act(() => useAgentStore.getState().select({ kind: "node", node: "greeting" }));
  expect(screen.getByRole("button", { name: "Delete node" })).toBeEnabled();
});
