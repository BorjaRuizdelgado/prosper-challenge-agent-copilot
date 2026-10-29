import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { chatOf, resetCopilotStore, useCopilotStore } from "../copilot/copilotStore";
import type { Agent, Finding } from "../model";
import { resetRunsStore, useRunsStore } from "../runs/runsStore";
import { useAgentStore } from "../store";
import { renderApp } from "../test/helpers";
import { CopilotPanel } from "./CopilotPanel";

const agent: Agent = { name: "a", initial_node: "greeting", nodes: [{ name: "greeting" }, { name: "end" }] };
const findings: Finding[] = [
  { title: "Callers cannot cancel", runs: ["r-1", "r-2"], cause: "The greeting has no cancel path.", fix: "Add a cancel edge.", node: "greeting" },
  { title: "Intake asks too much", runs: ["r-3"], cause: "One node asks four questions.", fix: "Split it." },
];

function seed(running = false) {
  useCopilotStore.setState({
    chats: {
      demo: {
        messages: [
          { role: "user", text: "Review this agent's production runs." },
          { role: "assistant", text: "Done.", steps: [], findings },
        ],
        running,
        startedAt: null,
        focus: null,
        review: null,
      },
    },
  });
}

beforeEach(() => {
  resetCopilotStore();
  resetRunsStore();
  useAgentStore.setState({ agentId: "demo", agent, dirty: false, dockTab: "copilot" });
});

describe("FindingsCard", () => {
  it("shows each finding's title, cause, fix and run ids", () => {
    seed();
    renderApp(<CopilotPanel />);
    const card = screen.getByRole("region", { name: "Findings" });
    expect(card).toHaveTextContent("2 findings");
    expect(card).toHaveTextContent("Callers cannot cancel");
    expect(card).toHaveTextContent("The greeting has no cancel path.");
    expect(card).toHaveTextContent("Split it.");
    expect(screen.getAllByRole("button", { name: /^r-\d$/ }).map((b) => b.textContent)).toEqual(["r-1", "r-2", "r-3"]);
  });

  it("has no card when the reply has no findings", () => {
    useCopilotStore.setState({
      chats: { demo: { messages: [{ role: "user", text: "hi" }, { role: "assistant", text: "Hello.", steps: [] }], running: false, startedAt: null, focus: null, review: null } },
    });
    renderApp(<CopilotPanel />);
    expect(screen.queryByRole("region", { name: "Findings" })).not.toBeInTheDocument();
  });

  it("opens the Runs tab with the cited run selected", async () => {
    seed();
    renderApp(<CopilotPanel />);
    await userEvent.click(screen.getByRole("button", { name: "r-2" }));
    expect(useAgentStore.getState().dockTab).toBe("runs");
    expect(useRunsStore.getState().selected).toEqual({ agentId: "demo", runId: "r-2" });
  });

  it("focuses the finding's node on the canvas while hovering it", async () => {
    seed();
    renderApp(<CopilotPanel />);
    const focus = () => chatOf(useCopilotStore.getState().chats, "demo").focus;
    await userEvent.hover(screen.getByText("Callers cannot cancel"));
    expect(focus()).toBe("greeting");
    await userEvent.unhover(screen.getByText("Callers cannot cancel"));
    expect(focus()).toBeNull();
    await userEvent.hover(screen.getByText("Intake asks too much"));
    expect(focus()).toBeNull();
  });

  it("leaves the focus to a running turn", async () => {
    seed(true);
    renderApp(<CopilotPanel />);
    await userEvent.hover(screen.getByText("Callers cannot cancel"));
    expect(chatOf(useCopilotStore.getState().chats, "demo").focus).toBeNull();
  });
});
