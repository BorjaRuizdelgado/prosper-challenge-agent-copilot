import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYZE_RUNS_MESSAGE } from "../call/askCopilot";
import { chatOf, resetCopilotStore, setCopilotStreamer, useCopilotStore } from "../copilot/copilotStore";
import type { Agent, Run } from "../model";
import { resetRunsStore, useRunsStore } from "../runs/runsStore";
import { useAgentStore } from "../store";
import { json, mockApi, renderApp } from "../test/helpers";
import { RunsPanel } from "./RunsPanel";

const agent: Agent = {
  name: "A",
  initial_node: "greeting",
  nodes: [{ name: "greeting", edges: [{ function: "book", description: "", target: "collect" }] }, { name: "collect" }],
};

const run = (id: string, over: Partial<Run> = {}): Run => ({
  id, started_at: "2026-10-21T09:14:00Z", duration_s: 96, outcome: "completed",
  transcript: [{ speaker: "agent", text: "Hello." }, { speaker: "caller", text: `Hi from ${id}` }],
  path: [{ node: "greeting" }, { node: "collect", via: "book", args: { reason: "cough" } }],
  ...over,
});

const runs = [
  run("r-new", { outcome: "stuck", flag: "Could not cancel." }),
  run("r-mid", { outcome: "completed" }),
  run("r-old", { outcome: "abandoned", path: [{ node: "greeting" }, { node: "removed_step", via: "x" }] }),
];

beforeEach(() => {
  resetRunsStore();
  resetCopilotStore();
  useAgentStore.setState({ agentId: "demo", agent, dockTab: "runs" });
});

describe("RunsPanel", () => {
  it("summarizes the runs and lists them in the order the API returns them, with the flag", async () => {
    mockApi({ "GET /api/agents/demo/runs": () => json(runs) });
    renderApp(<RunsPanel />);
    const summary = await screen.findByTestId("runs-summary");
    expect(summary).toHaveTextContent("3 runs · 1 completed · 0 transferred · 1 abandoned · 1 stuck · 1 flagged");
    const rows = screen.getAllByRole("button", { expanded: false });
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Hi from r-new"),
      expect.stringContaining("Hi from r-mid"),
      expect.stringContaining("Hi from r-old"),
    ]);
    expect(rows[0]).toHaveTextContent("Flagged: Could not cancel.");
    expect(rows[0]).toHaveTextContent("1m36s");
  });

  it("says there are no runs and offers nothing else", async () => {
    mockApi({ "GET /api/agents/demo/runs": () => json([]) });
    renderApp(<RunsPanel />);
    expect(await screen.findByText("This agent has no production runs.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the error with Retry and loads again", async () => {
    let fail = true;
    mockApi({ "GET /api/agents/demo/runs": () => (fail ? new Response("", { status: 500 }) : json(runs)) });
    renderApp(<RunsPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the runs (500)");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("runs-summary")).toBeInTheDocument();
  });

  it("expands a run with transcript, transition notes and the path, naming missing nodes", async () => {
    mockApi({ "GET /api/agents/demo/runs": () => json(runs) });
    renderApp(<RunsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /Hi from r-old/ }));
    expect(screen.getByRole("list", { name: "Transcript" })).toHaveTextContent("Hi from r-old");
    expect(screen.getByRole("list", { name: "Transitions" })).toHaveTextContent("Started at greeting");
    expect(screen.getByRole("list", { name: "Transitions" })).toHaveTextContent("Moved to removed_step via x");
    expect(screen.getByLabelText("Path")).toHaveTextContent("greeting -> removed_step (missing)");
    expect(useRunsStore.getState().selected).toEqual({ agentId: "demo", runId: "r-old" });
    await userEvent.click(screen.getByRole("button", { name: /Hi from r-old/ }));
    expect(screen.queryByRole("list", { name: "Transcript" })).toBeNull();
  });

  it("closes the open run when the tab is left", async () => {
    mockApi({ "GET /api/agents/demo/runs": () => json(runs) });
    const { unmount } = renderApp(<RunsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /Hi from r-mid/ }));
    expect(useRunsStore.getState().selected).not.toBeNull();
    act(() => unmount());
    expect(useRunsStore.getState().selected).toBeNull();
  });

  it("Ask Copilot on a run prefills the input and starts no turn", async () => {
    const streamer = vi.fn(async function* () {
      yield { event: "done" as const };
    });
    const restore = setCopilotStreamer(streamer);
    mockApi({ "GET /api/agents/demo/runs": () => json(runs) });
    renderApp(<RunsPanel />);
    await userEvent.click(await screen.findByText(/Hi from r-new/));
    await userEvent.click(screen.getByRole("button", { name: "Ask Copilot" }));
    const prefill = useCopilotStore.getState().prefill;
    expect(prefill).toContain("Flag: Could not cancel.");
    expect(prefill).toContain("Outcome: stuck");
    expect(prefill?.endsWith("What went wrong: ")).toBe(true);
    expect(useAgentStore.getState().dockTab).toBe("copilot");
    expect(streamer).not.toHaveBeenCalled();
    expect(chatOf(useCopilotStore.getState().chats, "demo").messages).toEqual([]);
    restore();
  });

  describe("Analyze runs", () => {
    it("opens the Copilot tab and sends the review request with the working copy, once", async () => {
      const streamer = vi.fn(async function* () {
        yield { event: "done" as const };
      });
      const restore = setCopilotStreamer(streamer);
      mockApi({ "GET /api/agents/demo/runs": () => json(runs) });
      renderApp(<RunsPanel />);
      await userEvent.click(await screen.findByRole("button", { name: "Analyze runs" }));
      expect(useAgentStore.getState().dockTab).toBe("copilot");
      expect(chatOf(useCopilotStore.getState().chats, "demo").messages[0]).toEqual({ role: "user", text: ANALYZE_RUNS_MESSAGE });
      expect(streamer).toHaveBeenCalledTimes(1);
      expect(streamer.mock.calls[0]).toEqual(["demo", ANALYZE_RUNS_MESSAGE, agent, expect.anything()]);
      restore();
    });

    it("is disabled and says why while a turn is running", async () => {
      useCopilotStore.setState({
        chats: { demo: { messages: [], running: true, startedAt: null, focus: null, review: null } },
      });
      mockApi({ "GET /api/agents/demo/runs": () => json(runs) });
      renderApp(<RunsPanel />);
      expect(await screen.findByRole("button", { name: "Analyze runs" })).toBeDisabled();
      expect(screen.getByText("The copilot is busy.")).toBeInTheDocument();
    });
  });
});
