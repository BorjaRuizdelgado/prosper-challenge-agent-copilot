import { ReactFlowProvider } from "@xyflow/react";
import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetCallStore, useCallStore } from "../call/callStore";
import type { NodeProps } from "@xyflow/react";
import type { CardNode } from "../graph";
import { NodeCard } from "./NodeCard";

const props = (name: string) =>
  ({
    data: { node: { name, task_messages: [{ role: "developer", content: "t" }], edges: [] }, initial: false },
    selected: false,
  }) as unknown as NodeProps<CardNode>;

beforeEach(() => resetCallStore());

describe("active node highlight", () => {
  it("marks only the node the call is in and clears at call end", () => {
    render(
      <ReactFlowProvider>
        <NodeCard {...props("greeting")} />
        <NodeCard {...props("confirm")} />
      </ReactFlowProvider>,
    );
    const card = (name: string) => screen.getByText(name).closest(".node-card")!;
    expect(card("greeting")).not.toHaveAttribute("data-active");
    act(() => useCallStore.setState({ activeNode: "confirm" }));
    expect(card("confirm")).toHaveAttribute("data-active", "true");
    expect(card("greeting")).not.toHaveAttribute("data-active");
    act(() => useCallStore.setState({ activeNode: null }));
    expect(card("confirm")).not.toHaveAttribute("data-active");
  });
});
