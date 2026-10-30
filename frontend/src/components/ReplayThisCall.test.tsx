import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetCopilotStore, setReplayStreamer, type ReplayStreamer, useCopilotStore } from "../copilot/copilotStore";
import type { Agent, Run } from "../model";
import type { ReplayEvent } from "../replay/client";
import { resetReplayView, useCanvasPath } from "../replay/replayView";
import { resetRunsStore, useRunsStore } from "../runs/runsStore";
import { useAgentStore } from "../store";
import { renderApp } from "../test/helpers";
import { RunsPanel } from "./RunsPanel";

const agent: Agent = {
  name: "A", initial_node: "greeting",
  nodes: [{ name: "greeting", edges: [{ function: "book", description: "", target: "collect" }, { function: "staff", description: "", target: "handoff" }] }, { name: "collect" }, { name: "handoff", end: true }],
};
const run: Run = {
  id: "r-cancel", started_at: "2026-10-21T09:14:00Z", duration_s: 40, outcome: "abandoned", goal: "Cancel the Friday appointment",
  transcript: [{ speaker: "caller", text: "I need to cancel." }], path: [{ node: "greeting" }],
};
const result = (goal_met: boolean): ReplayEvent => ({
  event: "result", run_id: "r-cancel", version: "before",
  transcript: [{ speaker: "agent", text: "Hi, how can I help?" }, { speaker: "caller", text: "Cancel please." }],
  path: [{ node: "greeting" }, { node: "handoff", via: "staff" }],
  outcome: goal_met ? "transferred" : "stuck", goal_met, reason: goal_met ? "Handed to staff." : "No cancel path.",
});

function PathProbe() {
  const p = useCanvasPath();
  return <output data-testid="path">{p ? `${p.nodes.join(",")}|${p.edges.join(",")}|${p.last}` : "none"}</output>;
}

const restores: Array<() => void> = [];
const streaming = (events: ReplayEvent[]) => {
  const calls: Array<[Agent, Agent | null, string[]]> = [];
  const fn: ReplayStreamer = async function* (_id, base, proposal, ids) {
    calls.push([base, proposal, ids]);
    yield* events;
    yield { event: "done" };
  };
  restores.push(setReplayStreamer(fn));
  return calls;
};

beforeEach(() => {
  resetRunsStore();
  resetCopilotStore();
  resetReplayView();
  useAgentStore.setState({ agentId: "demo", agent, dockTab: "runs", copilotOpen: false });
  useRunsStore.setState({ byAgent: { demo: { status: "ready", runs: [run], error: null } } });
  act(() => useRunsStore.getState().select("demo", "r-cancel"));
});
afterEach(() => restores.splice(0).forEach((r) => r()));

const replayButton = () => within(screen.getByRole("region", { name: "Replay this call" })).getByRole("button", { name: /Replay/ });

describe("Replay this call", () => {
  it("replays the working copy without a proposal and shows outcome, goal, reason and transcript", async () => {
    const calls = streaming([result(true)]);
    renderApp(<><RunsPanel /><PathProbe /></>);
    expect(screen.getByRole("region", { name: "Replay this call" })).toHaveTextContent("Simulated text call");
    await userEvent.click(replayButton());
    const section = screen.getByRole("region", { name: "Replay this call" });
    expect(await within(section).findByText("Goal met")).toBeInTheDocument();
    expect(section).toHaveTextContent("transferred");
    expect(section).toHaveTextContent("Goal: Cancel the Friday appointment");
    expect(section).toHaveTextContent("Handed to staff.");
    expect(within(section).getByRole("list", { name: "Replay transcript" })).toHaveTextContent("Cancel please.");
    expect(calls).toEqual([[agent, null, ["r-cancel"]]]);
  });

  it("draws the replay's path on the canvas, replacing the original run's, and clears it with the run", async () => {
    streaming([result(true)]);
    renderApp(<><RunsPanel /><PathProbe /></>);
    expect(screen.getByTestId("path")).toHaveTextContent("greeting|"); // the original run
    await userEvent.click(replayButton());
    await screen.findByText("Goal met");
    expect(screen.getByTestId("path")).toHaveTextContent("greeting,handoff|greeting::staff|handoff");
    act(() => useRunsStore.getState().clear());
    expect(screen.getByTestId("path")).toHaveTextContent("none");
  });

  it("shows a not-met result", async () => {
    streaming([result(false)]);
    renderApp(<RunsPanel />);
    await userEvent.click(replayButton());
    expect(await screen.findByText("Goal not met")).toBeInTheDocument();
    expect(screen.getByText("No cancel path.")).toBeInTheDocument();
  });

  it("shows the error when replay could not run", async () => {
    streaming([{ event: "error", message: "Replay needs OPENAI_API_KEY in backend/.env.", setup: true }]);
    renderApp(<RunsPanel />);
    await userEvent.click(replayButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("OPENAI_API_KEY");
  });

  it("is disabled with a reason while a copilot draft is on the canvas", () => {
    useCopilotStore.setState({ chats: { demo: { messages: [], running: true, startedAt: 1, focus: null, review: { base: agent, agent } } } });
    renderApp(<RunsPanel />);
    expect(replayButton()).toBeDisabled();
    expect(screen.getByText("Apply or discard the copilot's draft first.")).toBeInTheDocument();
  });
});
