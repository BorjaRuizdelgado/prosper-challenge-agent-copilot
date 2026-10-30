import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ReplayState, resetCopilotStore, setReplayStreamer, useCopilotStore } from "../copilot/copilotStore";
import type { Agent, Run } from "../model";
import type { ReplayResult } from "../replay/client";
import { resetReplayView, useReplayView } from "../replay/replayView";
import { resetRunsStore, useRunsStore } from "../runs/runsStore";
import { useAgentStore } from "../store";
import { renderApp } from "../test/helpers";
import { CopilotPanel } from "./CopilotPanel";
import { summarizeReplay } from "./ReplayCard";
import { scoreReplay } from "../replay/select";

const base: Agent = { name: "a", initial_node: "n", nodes: [{ name: "n", edges: [{ function: "go", description: "d", target: "m" }] }, { name: "m" }] };
const proposed: Agent = { ...base, name: "b" };
const run = (id: string, outcome: Run["outcome"]): Run => ({ id, outcome, started_at: "2026-01-01T00:00:00Z", duration_s: 1, transcript: [], path: [] });
const runs = [run("r-bad", "abandoned"), run("r-good", "completed")];
const res = (outcome: ReplayResult["outcome"], goal_met: boolean, reason = "because"): ReplayResult => ({
  transcript: [{ speaker: "agent", text: "Hello there" }, { speaker: "caller", text: "Cancel please" }],
  path: [{ node: "n" }, { node: "m", via: "go" }], outcome, goal_met, reason,
});

function seed(replay?: ReplayState, status: "pending" | "applied" = "pending") {
  useCopilotStore.setState({
    chats: {
      demo: {
        messages: [
          { role: "user", text: "go" },
          { role: "assistant", text: "Done.", steps: [], proposal: { agent: proposed, issues: [], base, status }, ...(replay && { replay }) },
        ],
        running: false, startedAt: null, focus: null, review: null,
      },
    },
  });
}

beforeEach(() => {
  resetCopilotStore();
  resetRunsStore();
  resetReplayView();
  useAgentStore.setState({ agentId: "demo", agent: base, issues: [] });
  useRunsStore.setState({ byAgent: { demo: { status: "ready", runs, error: null } } });
});
afterEach(() => (vi.restoreAllMocks(), vi.unstubAllGlobals()));

const card = () => screen.getByRole("region", { name: "Replay" });

describe("summarizeReplay", () => {
  it("reads like the spec example", () => {
    const replay: ReplayState = {
      status: "done", ids: ["r-bad", "r-good"],
      runs: { "r-bad": { before: res("abandoned", false), after: res("completed", true) }, "r-good": { before: res("completed", true), after: res("completed", true) } },
    };
    expect(summarizeReplay(scoreReplay(runs, replay.runs), replay)).toBe("Fixed 1 of 1 failing call · 1 of 1 working call still works");
  });

  it("counts broken and not reproduced, and shows progress while running", () => {
    const replay: ReplayState = {
      status: "done", ids: ["r-bad", "r-good"],
      runs: { "r-bad": { before: res("completed", true), after: res("completed", true) }, "r-good": { before: res("completed", true), after: res("stuck", false) } },
    };
    expect(summarizeReplay(scoreReplay(runs, replay.runs), replay)).toBe("0 of 1 working call still work · 1 broken · 1 not reproduced");
    const running: ReplayState = { status: "running", ids: ["r-bad", "r-good"], runs: { "r-bad": { before: res("stuck", false), after: res("completed", true) } } };
    expect(summarizeReplay(scoreReplay(runs, running.runs), running)).toBe("Replaying 2 calls… 1 of 2 done");
  });
});

describe("ReplayCard", () => {
  it("offers Replay calls when nothing was replayed, with the simulated label, and starts it", async () => {
    seed();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => runs }));
    const calls: Array<Agent | null> = [];
    const restore = setReplayStreamer(async function* (_id, _b, proposal) { calls.push(proposal); yield { event: "done" }; });
    renderApp(<CopilotPanel />);
    expect(within(card()).getByText("Simulated text calls")).toBeInTheDocument();
    await userEvent.click(within(card()).getByRole("button", { name: "Replay calls" }));
    restore();
    vi.unstubAllGlobals();
    expect(calls).toEqual([proposed]);
  });

  it("has no card for an applied proposal without results, or an agent without runs", () => {
    seed(undefined, "applied");
    renderApp(<CopilotPanel />);
    expect(screen.queryByRole("region", { name: "Replay" })).toBeNull();
  });

  it("shows the summary and one row per run with outcomes, verdict and reason", () => {
    seed({
      status: "done", ids: ["r-bad", "r-good"],
      runs: { "r-bad": { before: res("abandoned", false, "no cancel path"), after: res("transferred", true, "handed to staff") }, "r-good": { before: res("completed", true), after: res("completed", true) } },
    });
    renderApp(<CopilotPanel />);
    expect(within(card()).getByText("Fixed 1 of 1 failing call · 1 of 1 working call still works")).toBeInTheDocument();
    const rows = within(card()).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("r-bad");
    expect(rows[0]).toHaveTextContent("Fixed");
    expect(rows[0]).toHaveTextContent("abandoned, goal not met → transferred");
    expect(rows[0]).toHaveTextContent("handed to staff");
    expect(rows[1]).toHaveTextContent("Still works");
  });

  it("shows a failed row with its error and Retry, which replays that run", async () => {
    seed({ status: "done", ids: ["r-bad"], runs: { "r-bad": { error: "Replay failed: boom" } } });
    const seen: string[][] = [];
    const restore = setReplayStreamer(async function* (_a, _b, _p, ids) {
      seen.push(ids);
      yield { event: "result", run_id: "r-bad", version: "before", ...res("abandoned", false) };
      yield { event: "result", run_id: "r-bad", version: "after", ...res("completed", true) };
      yield { event: "done" };
    });
    renderApp(<CopilotPanel />);
    expect(within(card()).getByText("Replay failed: boom")).toBeInTheDocument();
    await userEvent.click(within(card()).getByRole("button", { name: "Retry" }));
    restore();
    expect(seen).toEqual([["r-bad"]]);
    expect(await within(card()).findByText("Fixed 1 of 1 failing call")).toBeInTheDocument();
  });

  it("shows the setup message with Retry when replay could not start", () => {
    seed({ status: "done", ids: ["r-bad"], runs: {}, error: { message: "Replay needs OPENAI_API_KEY in backend/.env.", setup: true } });
    renderApp(<CopilotPanel />);
    expect(within(card()).getByRole("alert")).toHaveTextContent("Replay needs OPENAI_API_KEY");
    expect(within(card()).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(within(card()).queryByRole("list", { name: "Replayed calls" })).toBeNull();
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  it("opens a row to show the after transcript and closes it again", async () => {
    seed({ status: "done", ids: ["r-bad"], runs: { "r-bad": { before: res("abandoned", false), after: res("transferred", true) } } });
    renderApp(<CopilotPanel />);
    const toggle = within(card()).getByRole("button", { name: /r-bad/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("list", { name: "Transcript of r-bad after" })).toHaveTextContent("Cancel please");
    expect(useReplayView.getState().row).toEqual({ agentId: "demo", index: 1, runId: "r-bad" });
    await userEvent.click(toggle);
    expect(screen.queryByRole("list", { name: "Transcript of r-bad after" })).toBeNull();
    expect(useReplayView.getState().row).toBeNull();
  });

  it("does not disable Apply while replaying", () => {
    seed({ status: "running", ids: ["r-bad"], runs: {} });
    renderApp(<CopilotPanel />);
    expect(within(card()).getByText("Replaying 1 call… 0 of 1 done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
    act(() => {});
  });
});
