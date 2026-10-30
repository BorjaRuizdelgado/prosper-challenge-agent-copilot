import type { ComponentProps } from "react";
import { act, render, screen } from "@testing-library/react";
import { Position, ReactFlowProvider } from "@xyflow/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LabelEdge } from "../components/LabelEdge";
import { NodeCard } from "../components/NodeCard";
import { resetCallStore } from "../call/callStore";
import { resetCopilotStore, useCopilotStore } from "../copilot/copilotStore";
import { toFlow } from "../graph";
import type { Agent } from "../model";
import { resetRunsStore } from "../runs/runsStore";
import { useAgentStore } from "../store";
import { resetReplayView, useReplayView } from "./replayView";

const base: Agent = {
  name: "A", initial_node: "greeting",
  nodes: [{ name: "greeting", edges: [{ function: "book", description: "", target: "collect" }] }, { name: "collect" }],
};
const proposed: Agent = {
  ...base,
  nodes: [
    { name: "greeting", edges: [{ function: "book", description: "", target: "collect" }, { function: "cancel", description: "", target: "handoff" }] },
    { name: "collect" },
    { name: "handoff", end: true },
  ],
};
const after = { transcript: [], outcome: "transferred" as const, goal_met: true, reason: "ok", path: [{ node: "greeting" }, { node: "handoff", via: "cancel" }] };

const edgeProps = (id: string) =>
  ({ id, sourceX: 0, sourceY: 0, targetX: 100, targetY: 100, sourcePosition: Position.Bottom, targetPosition: Position.Top, label: id, selected: false, data: {} }) as unknown as ComponentProps<typeof LabelEdge>;

function renderProposal() {
  const { nodes } = toFlow(proposed, {});
  return render(
    <ReactFlowProvider>
      {nodes.map((n) => (
        <div key={n.id} data-testid={n.id}>
          <NodeCard {...({ data: n.data, selected: false } as unknown as ComponentProps<typeof NodeCard>)} />
        </div>
      ))}
      <svg><LabelEdge {...edgeProps("greeting::cancel")} /></svg>
      <svg><LabelEdge {...edgeProps("greeting::book")} /></svg>
    </ReactFlowProvider>,
  );
}
const runOf = (name: string) => screen.getByTestId(name).querySelector(".node-card")!.getAttribute("data-run");

beforeEach(() => {
  resetRunsStore();
  resetCallStore();
  resetCopilotStore();
  resetReplayView();
  useAgentStore.setState({ agentId: "demo", agent: base, issues: [] });
  useCopilotStore.setState({
    chats: {
      demo: {
        messages: [
          { role: "user", text: "go" },
          {
            role: "assistant", text: "", steps: [],
            proposal: { agent: proposed, issues: [], base, status: "pending" },
            replay: { status: "done", ids: ["r-1"], runs: { "r-1": { after } } },
          },
        ],
        running: false, startedAt: null, focus: null, review: null,
      },
    },
  });
});

describe("replay row on the canvas", () => {
  it("opening a row puts the proposal on the canvas and marks its path; closing clears it", () => {
    renderProposal();
    expect(runOf("greeting")).toBeNull();
    act(() => useReplayView.getState().toggleRow("demo", 1, "r-1"));
    expect(useCopilotStore.getState().chats.demo.review?.agent).toBe(proposed);
    expect(runOf("greeting")).toBe("visited");
    expect(runOf("handoff")).toBe("end");
    expect(runOf("collect")).toBeNull();
    expect(document.querySelector(".edge--run")).not.toBeNull();
    expect(document.querySelectorAll(".edge--run")).toHaveLength(1);

    act(() => useReplayView.getState().toggleRow("demo", 1, "r-1"));
    expect(runOf("greeting")).toBeNull();
    expect(runOf("handoff")).toBeNull();
    expect(document.querySelector(".edge--run")).toBeNull();
  });

  it("drops the overlay when the proposal leaves the canvas", () => {
    renderProposal();
    act(() => useReplayView.getState().toggleRow("demo", 1, "r-1"));
    expect(runOf("handoff")).toBe("end");
    act(() => useCopilotStore.getState().hideReview("demo"));
    expect(runOf("handoff")).toBeNull();
  });
});
