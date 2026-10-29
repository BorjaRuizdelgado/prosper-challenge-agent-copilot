import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { resetCopilotStore, useCopilotStore, type Proposal } from "../copilot/copilotStore";
import type { Agent } from "../model";
import { useAgentStore } from "../store";
import { renderApp } from "../test/helpers";
import { summarize } from "./ProposalCard";
import { CopilotPanel } from "./CopilotPanel";
import { diffAgents } from "../copilot/diffAgents";

const base: Agent = {
  name: "a",
  initial_node: "n",
  nodes: [{ name: "n", task_messages: [{ role: "system", content: "Greet." }], edges: [{ function: "go", description: "d", target: "m" }] }, { name: "m" }],
  layout: { n: { x: 10, y: 20 }, m: { x: 30, y: 40 } },
};
const proposed: Agent = {
  ...base,
  nodes: [
    { name: "n", task_messages: [{ role: "system", content: "Greet warmly." }], edges: [{ function: "go", description: "d", target: "k" }] },
    { name: "k" },
  ],
};

function seed(proposal: Partial<Proposal> = {}) {
  useCopilotStore.setState({
    chats: {
      demo: {
        messages: [
          { role: "user", text: "change it" },
          { role: "assistant", text: "Done.", steps: [], proposal: { agent: proposed, issues: [], base, status: "pending", ...proposal } },
        ],
        running: false,
        startedAt: null,
        focus: null,
        review: null,
      },
    },
  });
}

beforeEach(() => {
  resetCopilotStore();
  useAgentStore.setState({
    agentId: "demo",
    agent: base,
    positions: { n: { x: 10, y: 20 }, m: { x: 30, y: 40 } },
    labelOffsets: {},
    dirty: false,
    dockTab: "copilot",
  });
});

describe("ProposalCard", () => {
  it("summarizes counts and keeps the Changes list collapsed until opened", async () => {
    seed();
    renderApp(<CopilotPanel />);
    expect(screen.getByText("1 node added, 1 node removed, 1 node changed, 1 edge changed")).toBeInTheDocument();
    const changes = screen.getByText("Changes").closest("details")!;
    expect(changes).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("Changes"));
    await userEvent.click(screen.getByText(/Changed node/));
    expect(screen.getByLabelText("task before")).toHaveTextContent("Greet.");
    expect(screen.getByLabelText("task after")).toHaveTextContent("Greet warmly.");
  });

  it("lists remaining issues and warns that Apply leaves the agent uncallable", () => {
    seed({ issues: [{ severity: "error", code: "E_DANGLING_TARGET", message: "Edge go points at nowhere", node: "n", edge: "go" }] });
    renderApp(<CopilotPanel />);
    expect(screen.getByLabelText("Remaining issues")).toHaveTextContent("Edge go points at nowhere");
    expect(screen.getByRole("note")).toHaveTextContent("will not be callable");
  });

  it("Apply replaces the agent as unsaved, keeps positions of kept nodes and marks the card applied", async () => {
    seed();
    renderApp(<CopilotPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    const s = useAgentStore.getState();
    expect(s.agent!.nodes.map((n) => n.name)).toEqual(["n", "k"]);
    expect(s.dirty).toBe(true);
    expect(s.positions.n).toEqual({ x: 10, y: 20 });
    expect(s.positions.m).toBeUndefined();
    expect(s.positions.k).toBeDefined();
    expect(screen.getByText("Applied.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("Discard leaves the editor untouched", async () => {
    seed();
    renderApp(<CopilotPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(useAgentStore.getState().agent).toBe(base);
    expect(useAgentStore.getState().dirty).toBe(false);
    expect(screen.getByText("Discarded.")).toBeInTheDocument();
  });

  it("asks before replacing edits made after the proposal arrived", async () => {
    seed();
    renderApp(<CopilotPanel />);
    useAgentStore.setState({ agent: { ...base, name: "edited" }, dirty: true });
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(useAgentStore.getState().agent!.name).toBe("edited");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useAgentStore.getState().agent!.name).toBe("edited");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply anyway" }));
    expect(useAgentStore.getState().agent!.nodes.map((n) => n.name)).toEqual(["n", "k"]);
  });
});

it("summarize reports an empty diff", () => {
  expect(summarize(diffAgents(base, base))).toBe("No changes");
});
