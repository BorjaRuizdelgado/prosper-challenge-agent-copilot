import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../App";
import { autoLayout } from "../layout";
import { useAgentStore } from "../store";
import { json, mockApi, renderApp } from "../test/helpers";

afterEach(() => vi.unstubAllGlobals());

const agent = {
  name: "Scheduler",
  initial_node: "greeting",
  layout: { greeting: { x: 0, y: 0 }, confirm: { x: 400, y: 0 } },
  nodes: [
    { name: "greeting", task_messages: [{ role: "developer", content: "Greet." }], edges: [] },
    { name: "confirm", task_messages: [], end: true },
  ],
};

let putStatus: number;

beforeEach(() => {
  putStatus = 200;
  mockApi({
    "GET /api/agents": () => json([]),
    "GET /api/agents/s-1": () => json({ id: "s-1", agent, updated_at: "" }),
    "PUT /api/agents/s-1": () => (putStatus === 200 ? json({ id: "s-1", agent, updated_at: "" }) : json({}, putStatus)),
  });
});

const sent = () =>
  (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    .filter(([, init]) => init?.method === "PUT")
    .map(([, init]) => JSON.parse(init.body));

async function openAndEdit() {
  const view = renderApp(<App />, "/agents/s-1");
  const dock = await screen.findByRole("complementary", { name: "Dock" });
  await act(async () => useAgentStore.getState().select({ kind: "node", node: "greeting" }));
  fireEvent.change(within(dock).getByLabelText("Content of message 1"), { target: { value: "Hello!" } });
  return view;
}

const status = () => screen.getByTestId("save-status");

test("starts saved, becomes unsaved after an edit, and saves text with positions", async () => {
  await openAndEdit();
  expect(status()).toHaveTextContent("Unsaved changes");

  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(status()).toHaveTextContent("Saved"));
  expect(sent()).toHaveLength(1);
  expect(sent()[0].nodes[0].task_messages[0].content).toBe("Hello!");
  expect(sent()[0].layout).toEqual({ greeting: { x: 0, y: 0 }, confirm: { x: 400, y: 0 } });
});

test("Ctrl+S saves", async () => {
  await openAndEdit();

  fireEvent.keyDown(window, { key: "s", ctrlKey: true });

  await waitFor(() => expect(sent()).toHaveLength(1));
});

test("a failed save keeps the edits dirty, shows the error, and Retry saves", async () => {
  await openAndEdit();
  putStatus = 500;
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the agent (500)");
  expect(status()).toHaveTextContent("Save failed");
  expect(useAgentStore.getState().dirty).toBe(true);
  expect(useAgentStore.getState().agent!.nodes[0].task_messages![0].content).toBe("Hello!");

  putStatus = 200;
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));

  await waitFor(() => expect(status()).toHaveTextContent("Saved"));
  expect(useAgentStore.getState().dirty).toBe(false);
});

test("an edit made while saving stays unsaved", async () => {
  await openAndEdit();
  const pending = act(() => useAgentStore.getState().save());
  act(() => useAgentStore.getState().updateNode("confirm", { end: false }));
  await pending;

  expect(useAgentStore.getState().dirty).toBe(true);
});

test("the Save button is disabled when nothing changed", async () => {
  renderApp(<App />, "/agents/s-1");
  await screen.findByRole("complementary", { name: "Dock" });

  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("navigating away with unsaved changes asks first; staying keeps the editor", async () => {
  const { router } = await openAndEdit();

  await act(async () => void router.navigate("/"));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Leave without saving?");

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(router.state.location.pathname).toBe("/agents/s-1");

  await act(async () => void router.navigate("/"));
  fireEvent.click(await screen.findByRole("button", { name: "Leave" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
});

test("a clean agent navigates away without a prompt", async () => {
  const { router } = renderApp(<App />, "/agents/s-1");
  await screen.findByRole("complementary", { name: "Dock" });

  await act(async () => void router.navigate("/"));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(router.state.location.pathname).toBe("/");
});

test("registers a beforeunload guard only while dirty", async () => {
  await openAndEdit();
  const event = new Event("beforeunload", { cancelable: true });

  window.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
});

test("a moved node's position is saved in the layout and Auto layout resets it", async () => {
  renderApp(<App />, "/agents/s-1");
  await screen.findByRole("complementary", { name: "Dock" });
  await act(async () => useAgentStore.getState().moveNode("greeting", { x: 555, y: 321 }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(status()).toHaveTextContent("Saved"));
  expect(sent()[0].layout.greeting).toEqual({ x: 555, y: 321 });

  fireEvent.click(screen.getByRole("button", { name: "Auto layout" }));
  expect(useAgentStore.getState().positions.greeting).not.toEqual({ x: 555, y: 321 });
  expect(useAgentStore.getState().positions.greeting).toEqual(autoLayout(agent).greeting);
  expect(status()).toHaveTextContent("Unsaved changes");
});

test("a dragged edge label is saved in the layout and restored on reload", async () => {
  renderApp(<App />, "/agents/s-1");
  await screen.findByRole("complementary", { name: "Dock" });

  await act(async () => useAgentStore.getState().moveLabel("greeting::go", { x: 30, y: -20 }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(status()).toHaveTextContent("Saved"));
  expect(sent()[0].layout["greeting::go"]).toEqual({ x: 30, y: -20 });
  expect(sent()[0].layout.greeting).toBeDefined();

  const saved = { ...agent, layout: sent()[0].layout };
  mockApi({ "GET /api/agents": () => json([]), "GET /api/agents/s-1": () => json({ id: "s-1", agent: saved, updated_at: "" }) });
  await act(async () => useAgentStore.getState().load("s-1"));

  expect(useAgentStore.getState().labelOffsets).toEqual({ "greeting::go": { x: 30, y: -20 } });
  expect(Object.keys(useAgentStore.getState().positions).sort()).toEqual(["confirm", "greeting"]);
});
