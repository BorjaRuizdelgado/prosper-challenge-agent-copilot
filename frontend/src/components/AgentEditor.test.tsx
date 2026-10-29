import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../App";
import { json, mockApi, renderApp } from "../test/helpers";
import { useAgentStore } from "../store";

afterEach(() => vi.unstubAllGlobals());

const agent = {
  name: "Scheduler",
  initial_node: "greeting",
  layout: { greeting: { x: 0, y: 0 }, confirm: { x: 400, y: 0 } },
  nodes: [
    {
      name: "greeting",
      task_messages: [{ role: "developer", content: "Greet the caller." }],
      edges: [{ function: "choose_intent", description: "d", target: "confirm" }],
    },
    { name: "confirm", task_messages: [], end: true },
  ],
};

const routes = (status = 200) => ({
  "GET /api/agents": () => json([]),
  "GET /api/agents/s-1": () => (status === 200 ? json({ id: "s-1", agent, updated_at: "" }) : json({}, status)),
});

test("opening an agent renders its nodes as cards with start/end marks and task summary", async () => {
  mockApi(routes());
  renderApp(<App />, "/agents/s-1");

  const canvas = await screen.findByTestId("canvas");

  expect(await screen.findByRole("heading", { name: "Scheduler" })).toBeInTheDocument();
  expect(canvas).toHaveTextContent("greeting");
  expect(canvas).toHaveTextContent("Greet the caller.");
  expect(canvas).toHaveTextContent("Start");
  expect(canvas).toHaveTextContent("End");
  expect(canvas).toHaveTextContent("choose_intent");
});

test("a failed load shows the error with a working retry", async () => {
  let ok = false;
  mockApi({
    ...routes(500),
    "GET /api/agents/s-1": () => (ok ? json({ id: "s-1", agent, updated_at: "" }) : json({}, 500)),
  });
  renderApp(<App />, "/agents/s-1");

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the agent (500)");
  ok = true;
  screen.getByRole("button", { name: "Retry" }).click();

  expect(await screen.findByRole("heading", { name: "Scheduler" })).toBeInTheDocument();
});

test("clicking nodes shows them in the Inspector", async () => {
  mockApi(routes());
  renderApp(<App />, "/agents/s-1");
  const canvas = await screen.findByTestId("canvas");
  const dock = screen.getByRole("complementary", { name: "Dock" });
  expect(dock).toHaveTextContent("Select a node or an edge");

  fireEvent.click(await within(canvas).findByText("Greet the caller."));
  expect(within(dock).getByLabelText("Name")).toHaveValue("greeting");
  expect(within(dock).getByLabelText("Content of message 1")).toHaveValue("Greet the caller.");

  fireEvent.click(within(canvas).getByText("confirm", { selector: ".node-card__name" }));
  expect(within(dock).getByLabelText("Ends the call")).toBeChecked();
});

test("selecting an element switches the dock back to the Inspector tab", () => {
  useAgentStore.setState({ dockTab: "other" });
  useAgentStore.getState().select({ kind: "node", node: "greeting" });

  expect(useAgentStore.getState().dockTab).toBe("inspector");
  expect(useAgentStore.getState().selection).toEqual({ kind: "node", node: "greeting" });

  useAgentStore.getState().select(null);
  expect(useAgentStore.getState().selection).toBeNull();
});

test("an edge selection shows function, target and parameters", async () => {
  mockApi(routes());
  renderApp(<App />, "/agents/s-1");
  await screen.findByTestId("canvas");

  act(() => useAgentStore.getState().select({ kind: "edge", node: "greeting", function: "choose_intent" }));

  expect(screen.getByRole("form", { name: "Edge" })).toBeInTheDocument();
  expect(screen.getByLabelText("Function")).toHaveValue("choose_intent");
  expect(screen.getByLabelText("Target")).toHaveValue("confirm");
});

test("Add node puts a new card on the canvas, selects it and marks the agent unsaved", async () => {
  mockApi(routes());
  renderApp(<App />, "/agents/s-1");
  const canvas = await screen.findByTestId("canvas");

  fireEvent.click(screen.getByRole("button", { name: "Add node" }));

  expect(await within(canvas).findByText("new_node", { selector: ".node-card__name" })).toBeInTheDocument();
  expect(screen.getByLabelText("Name")).toHaveValue("new_node");
  expect(screen.getByTestId("save-status")).toHaveTextContent("Unsaved changes");
});
