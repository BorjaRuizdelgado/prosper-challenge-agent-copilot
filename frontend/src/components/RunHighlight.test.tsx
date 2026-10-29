import type { ComponentProps } from "react";
import { act, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetCallStore, useCallStore } from "../call/callStore";
import { resetCopilotStore, useCopilotStore } from "../copilot/copilotStore";
import { toFlow } from "../graph";
import type { Agent, Run } from "../model";
import { resetRunsStore, useRunsStore } from "../runs/runsStore";
import { useAgentStore } from "../store";
import { NodeCard } from "./NodeCard";
import { LabelEdge } from "./LabelEdge";
import { Position } from "@xyflow/react";

const agent: Agent = {
  name: "A",
  initial_node: "greeting",
  nodes: [
    { name: "greeting", edges: [{ function: "book", description: "", target: "collect" }] },
    { name: "collect", edges: [{ function: "done", description: "", target: "bye" }] },
    { name: "bye", end: true },
  ],
};

const stuck: Run = {
  id: "r-1", started_at: "2026-10-21T09:14:00Z", duration_s: 30, outcome: "stuck", transcript: [],
  path: [{ node: "greeting" }, { node: "collect", via: "book" }],
};

const card = (name: string) => {
  const { nodes } = toFlow(agent, {});
  const n = nodes.find((x) => x.id === name)!;
  return <NodeCard {...({ data: n.data, selected: false } as unknown as ComponentProps<typeof NodeCard>)} />;
};

function renderNodes() {
  return render(
    <ReactFlowProvider>
      {["greeting", "collect", "bye"].map((n) => (
        <div key={n} data-testid={n}>{card(n)}</div>
      ))}
    </ReactFlowProvider>,
  );
}

const runOf = (name: string) => screen.getByTestId(name).querySelector(".node-card")!.getAttribute("data-run");

beforeEach(() => {
  resetRunsStore();
  resetCallStore();
  resetCopilotStore();
  useAgentStore.setState({ agentId: "demo", agent, issues: [] });
  useRunsStore.setState({ byAgent: { demo: { status: "ready", runs: [stuck], error: null } } });
});

describe("run highlight on the canvas", () => {
  it("marks visited nodes and the node where the run ended", () => {
    renderNodes();
    expect(runOf("greeting")).toBeNull();
    act(() => useRunsStore.getState().select("demo", "r-1"));
    expect(runOf("greeting")).toBe("visited");
    expect(runOf("collect")).toBe("end");
    expect(runOf("bye")).toBeNull();
  });

  it("clears when the run is closed or the agent changes", () => {
    renderNodes();
    act(() => useRunsStore.getState().select("demo", "r-1"));
    act(() => useRunsStore.getState().clear());
    expect(runOf("collect")).toBeNull();
    act(() => useRunsStore.getState().select("demo", "r-1"));
    act(() => useAgentStore.setState({ agentId: "other" }));
    expect(runOf("collect")).toBeNull();
  });

  it("is hidden while a copilot draft is under review", () => {
    renderNodes();
    act(() => useRunsStore.getState().select("demo", "r-1"));
    act(() =>
      useCopilotStore.setState({
        chats: { demo: { messages: [], running: false, startedAt: null, focus: null, review: { base: agent, agent } } },
      }),
    );
    expect(runOf("collect")).toBeNull();
  });

  it("gives way to a live call", () => {
    renderNodes();
    act(() => useRunsStore.getState().select("demo", "r-1"));
    act(() => useCallStore.setState({ activeNode: "bye" }));
    expect(runOf("collect")).toBeNull();
  });

  it("colours the edges the run took", () => {
    act(() => useRunsStore.getState().select("demo", "r-1"));
    const edge = (id: string) =>
      render(
        <ReactFlowProvider>
          <svg>
            <LabelEdge
              {...({ id, sourceX: 0, sourceY: 0, targetX: 100, targetY: 100, sourcePosition: Position.Right, targetPosition: Position.Left, label: "x", selected: false } as unknown as ComponentProps<typeof LabelEdge>)}
            />
          </svg>
        </ReactFlowProvider>,
      ).container.querySelector("path.edge--run");
    expect(edge("greeting::book")).not.toBeNull();
    expect(edge("collect::done")).toBeNull();
  });
});
