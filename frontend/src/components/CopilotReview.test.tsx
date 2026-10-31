import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../App";
import { resetCopilotStore, useCopilotStore } from "../copilot/copilotStore";
import { diffAgents } from "../copilot/diffAgents";
import type { Agent } from "../model";
import { useAgentStore } from "../store";
import { json, mockApi, renderApp } from "../test/helpers";

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => resetCopilotStore());

const base: Agent = {
  name: "Scheduler",
  initial_node: "greeting",
  layout: { greeting: { x: 0, y: 0 }, confirm: { x: 400, y: 0 }, old: { x: 800, y: 0 } },
  nodes: [
    {
      name: "greeting",
      task_messages: [{ role: "developer", content: "Greet the caller." }],
      edges: [{ function: "choose_intent", description: "d", target: "confirm" }],
    },
    { name: "confirm", task_messages: [{ role: "developer", content: "Confirm." }], end: true },
    { name: "old", task_messages: [] },
  ],
};
const draft: Agent = {
  ...base,
  nodes: [
    {
      name: "greeting",
      task_messages: [{ role: "developer", content: "Greet warmly." }],
      edges: [{ function: "choose_intent", description: "d", target: "confirm" }],
    },
    { name: "confirm", task_messages: [{ role: "developer", content: "Confirm." }], end: true },
    { name: "fresh", task_messages: [{ role: "developer", content: "Brand new step." }] },
  ],
};

async function open() {
  mockApi({
    "GET /api/agents": () => json([]),
    "GET /api/agents/s-1": () => json({ id: "s-1", agent: base, updated_at: "" }),
  });
  renderApp(<App />, "/agents/s-1");
  await screen.findByRole("heading", { name: "Scheduler" });
}

const show = (running: boolean, status: "pending" | "applied" = "pending") =>
  act(() =>
    useCopilotStore.setState({
      chats: {
        "s-1": {
          messages: [
            { role: "user", text: "go" },
            { role: "assistant", text: "", steps: [], proposal: running ? undefined : { agent: draft, issues: [], base, status } },
          ],
          running,
          startedAt: running ? Date.now() : null,
          focus: null,
          review: { base, agent: draft },
        },
      },
    }),
  );

const card = (canvas: HTMLElement, name: string) => within(canvas).getByText(name).closest(".node-card")!;

test("the canvas tags added, changed and removed nodes and leaves the working copy and positions alone", async () => {
  await open();
  const working = useAgentStore.getState().agent;
  const positions = useAgentStore.getState().positions;
  show(true);
  const canvas = screen.getByTestId("canvas");

  expect(card(canvas, "fresh")).toHaveAttribute("data-change", "added");
  expect(card(canvas, "greeting")).toHaveAttribute("data-change", "changed");
  expect(card(canvas, "old")).toHaveAttribute("data-change", "removed");
  expect(card(canvas, "confirm")).not.toHaveAttribute("data-change");
  expect(screen.getByRole("status", { name: "Copilot review" })).toHaveTextContent("Copilot draft");

  // The tags agree with the diff the Changes list shows.
  const diff = diffAgents(base, draft);
  expect([diff.addedNodes, diff.removedNodes, diff.changedNodes.map((c) => c.name)]).toEqual([["fresh"], ["old"], ["greeting"]]);

  const s = useAgentStore.getState();
  expect(s.agent).toBe(working);
  expect(s.positions).toBe(positions);
  expect(s.dirty).toBe(false);
});

test("the Inspector shows a proposed node read-only", async () => {
  await open();
  show(true);
  act(() => useAgentStore.getState().select({ kind: "node", node: "fresh" }));
  const panel = await screen.findByRole("tabpanel");
  expect(within(panel).getByDisplayValue("Brand new step.")).toBeDisabled();
  expect(within(panel).getByLabelText("Name")).toBeDisabled();
});

test("when the turn ends the banner offers Apply, Discard and Hide; Hide and Discard restore the working copy", async () => {
  await open();
  const working = useAgentStore.getState().agent;
  show(false);
  const banner = screen.getByRole("status", { name: "Copilot review" });
  expect(within(banner).getByRole("button", { name: "Apply" })).toBeInTheDocument();

  await userEvent.click(within(banner).getByRole("button", { name: "Hide" }));
  expect(screen.queryByRole("status", { name: "Copilot review" })).not.toBeInTheDocument();
  expect(card(screen.getByTestId("canvas"), "old")).not.toHaveAttribute("data-change");
  expect(within(screen.getByTestId("canvas")).queryByText("fresh")).not.toBeInTheDocument();
  expect(useAgentStore.getState().dirty).toBe(false);

  show(false);
  await userEvent.click(within(screen.getByRole("status", { name: "Copilot review" })).getByRole("button", { name: "Discard" }));
  expect(within(screen.getByTestId("canvas")).queryByText("fresh")).not.toBeInTheDocument();
  expect(useAgentStore.getState().agent).toBe(working);
  expect(useAgentStore.getState().dirty).toBe(false);
});

test("Apply from the banner loads the proposal as unsaved changes", async () => {
  await open();
  show(false);
  await userEvent.click(within(screen.getByRole("status", { name: "Copilot review" })).getByRole("button", { name: "Apply" }));
  const s = useAgentStore.getState();
  expect(s.agent!.nodes.map((n) => n.name)).toEqual(["greeting", "confirm", "fresh"]);
  expect(s.dirty).toBe(true);
  expect(s.positions.greeting).toEqual({ x: 0, y: 0 });
  expect(screen.queryByRole("status", { name: "Copilot review" })).not.toBeInTheDocument();
});
