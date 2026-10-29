import { screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../App";
import { json, mockApi, renderApp } from "../test/helpers";

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
