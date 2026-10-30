import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCallStore, setCallClientFactory } from "../call/callStore";
import { fakeClientFactory } from "../call/fakeClient";
import { useAgentStore } from "../store";
import { renderApp } from "../test/helpers";
import { Dock } from "./Dock";
import { CopilotPanel } from "./CopilotPanel";
import { resetCopilotStore } from "../copilot/copilotStore";
import type { Agent } from "../model";
import { CallPanel } from "./CallPanel";

let restore = () => {};
let fake: ReturnType<typeof fakeClientFactory>;

beforeEach(() => {
  resetCallStore();
  fake = fakeClientFactory();
  restore = setCallClientFactory(fake.factory);
  useAgentStore.setState({ agentId: "demo", dirty: false, issues: [], saveStatus: "idle" });
});
afterEach(() => restore());

describe("CallPanel", () => {
  it("starts a call for a saved agent and shows live controls", async () => {
    renderApp(<CallPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Test call" }));
    await waitFor(() => expect(screen.getByTestId("call-state")).toHaveTextContent("Live"));
    expect(fake.state.client!.connect).toHaveBeenCalledWith("demo");
    await userEvent.click(screen.getByRole("button", { name: "Hang up" }));
    expect(screen.getByTestId("call-state")).toHaveTextContent("Call ended");
  });

  it("saves first when there are unsaved changes, and does not call if saving fails", async () => {
    const save = vi.fn().mockResolvedValue(false);
    useAgentStore.setState({ dirty: true, save });
    renderApp(<CallPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Save and call" }));
    expect(save).toHaveBeenCalled();
    expect(fake.factory).not.toHaveBeenCalled();

    save.mockResolvedValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Save and call" }));
    await waitFor(() => expect(fake.state.client!.connect).toHaveBeenCalledWith("demo"));
  });

  it("is disabled with the reason when there are blocking issues", () => {
    useAgentStore.setState({ issues: [{ severity: "error", code: "bad-initial", message: "x" }] });
    renderApp(<CallPanel />);
    expect(screen.getByRole("button", { name: "Test call" })).toBeDisabled();
    expect(screen.getByText(/Fix the 1 error in Issues/)).toBeInTheDocument();
  });

  it("warnings do not block the call", () => {
    useAgentStore.setState({ issues: [{ severity: "warning", code: "dead-end", message: "x" }] });
    renderApp(<CallPanel />);
    expect(screen.getByRole("button", { name: "Test call" })).toBeEnabled();
  });
});

describe("CallPanel transcript", () => {
  it("shows both sides, notes, and keeps them after hang-up", async () => {
    renderApp(<CallPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Test call" }));
    await waitFor(() => expect(screen.getByTestId("call-state")).toHaveTextContent("Live"));
    const ev = fake.state.events!;
    act(() => {
      ev.onBotText("Hello there.");
      ev.onUserText("Hi, I need a slot");
      ev.onServerMessage({ type: "node_changed", from: "greeting", node: "collect", via: "go", args: {} });
    });
    const list = screen.getByRole("list", { name: "Transcript" });
    expect(within(list).getByText("Hello there.")).toBeInTheDocument();
    expect(within(list).getByText("Hi, I need a slot")).toBeInTheDocument();
    expect(within(list).getByText("Moved to collect via go")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hang up" }));
    expect(screen.getByRole("list", { name: "Transcript" })).toBeInTheDocument();
  });
});

describe("Ask Copilot", () => {
  const agent = { name: "a", initial_node: "greeting", nodes: [{ name: "greeting" }] } as unknown as Agent;

  async function finishedCall() {
    await userEvent.click(screen.getByRole("button", { name: "Test call" }));
    await waitFor(() => expect(screen.getByTestId("call-state")).toHaveTextContent("Live"));
    const ev = fake.state.events!;
    act(() => {
      ev.onServerMessage({ type: "node_changed", from: null, node: "greeting", via: null, args: {} });
      ev.onBotText("Hello there.");
      ev.onUserText("I want to book.");
    });
    await userEvent.click(screen.getByRole("button", { name: "Hang up" }));
  }

  beforeEach(() => {
    resetCopilotStore();
    useAgentStore.setState({ agent, dockTab: "call", copilotOpen: false });
  });

  it("is not offered before a call, during one, or when nobody spoke", async () => {
    renderApp(<CallPanel />);
    expect(screen.queryByRole("button", { name: "Ask Copilot" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Test call" }));
    await waitFor(() => expect(screen.getByTestId("call-state")).toHaveTextContent("Live"));
    expect(screen.queryByRole("button", { name: "Ask Copilot" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hang up" }));
    expect(screen.queryByRole("button", { name: "Ask Copilot" })).not.toBeInTheDocument();
  });

  it("opens the copilot with the transcript in the input, cursor at the end, and sends nothing", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", fetchSpy);
    renderApp(
      <>
        <Dock />
        <CopilotPanel />
      </>,
    );
    await finishedCall();
    await userEvent.click(screen.getByRole("button", { name: "Ask Copilot" }));

    const input = (await screen.findByRole("textbox", { name: "Message to the copilot" })) as HTMLTextAreaElement;
    await waitFor(() => expect(input.value).toContain("Caller: I want to book."));
    expect(input.value).toContain("Agent: Hello there.");
    expect(input.value).toContain("Path: greeting");
    expect(input.value.endsWith("What went wrong: ")).toBe(true);
    await waitFor(() => expect(input.selectionStart).toBe(input.value.length));
    expect(useAgentStore.getState().copilotOpen).toBe(true);
    expect(useAgentStore.getState().dockTab).toBe("call");
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/api/copilot"))).toBe(false);
  });
});
