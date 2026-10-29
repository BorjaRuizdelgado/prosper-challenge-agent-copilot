import { ReactFlowProvider } from "@xyflow/react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { NodeProps } from "@xyflow/react";
import { resetCopilotStore, useCopilotStore } from "../copilot/copilotStore";
import type { CardNode } from "../graph";
import { useAgentStore } from "../store";
import { NodeCard } from "./NodeCard";

const props = (name: string) =>
  ({
    data: { node: { name, task_messages: [{ role: "developer", content: "t" }], edges: [] }, initial: false },
    selected: false,
  }) as unknown as NodeProps<CardNode>;

const focus = (agentId: string, node: string | null) =>
  act(() =>
    useCopilotStore.setState({
      chats: { [agentId]: { messages: [], running: node !== null, startedAt: null, focus: node } },
    }),
  );

beforeEach(() => {
  resetCopilotStore();
  useAgentStore.setState({ agentId: "demo" });
});

describe("copilot focus on the canvas", () => {
  it("pulses only the focused node of the open agent and clears with the turn", () => {
    render(
      <ReactFlowProvider>
        <NodeCard {...props("greeting")} />
        <NodeCard {...props("confirm")} />
      </ReactFlowProvider>,
    );
    const card = (name: string) => screen.getByText(name).closest(".node-card")!;
    expect(card("confirm")).not.toHaveAttribute("data-copilot-focus");
    focus("demo", "confirm");
    expect(card("confirm")).toHaveAttribute("data-copilot-focus", "true");
    expect(card("confirm")).toHaveClass("node-card--copilot");
    expect(card("greeting")).not.toHaveAttribute("data-copilot-focus");
    focus("other", "greeting");
    expect(card("greeting")).not.toHaveAttribute("data-copilot-focus");
    focus("demo", null);
    expect(card("confirm")).not.toHaveAttribute("data-copilot-focus");
  });
});
