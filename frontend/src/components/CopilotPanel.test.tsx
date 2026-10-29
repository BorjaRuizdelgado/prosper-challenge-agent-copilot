import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CopilotEvent } from "../copilot/client";
import { resetCopilotStore, setCopilotStreamer, type Streamer } from "../copilot/copilotStore";
import type { Agent } from "../model";
import { useAgentStore } from "../store";
import { renderApp } from "../test/helpers";
import { Dock } from "./Dock";
import { CopilotPanel, EXAMPLES, SETUP_HELP } from "./CopilotPanel";

const agent = { name: "a", initial_node: "n", nodes: [{ name: "n" }] } as unknown as Agent;

let restore = () => {};
beforeEach(() => {
  resetCopilotStore();
  useAgentStore.setState({ agentId: "demo", agent, dockTab: "copilot" });
});
afterEach(() => {
  restore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A stream the test drives by hand. */
function controlled() {
  const queue: CopilotEvent[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  const streamer = vi.fn<Streamer>(async function* (_id, _m, _a, signal) {
    signal.addEventListener("abort", () => ((closed = true), wake?.()));
    while (!closed) {
      const next = queue.shift();
      if (!next) await new Promise<void>((r) => (wake = r));
      else if (next.event === "done") return;
      else yield next;
    }
  });
  restore = (() => {
    const undo = setCopilotStreamer(streamer);
    return undo;
  })();
  return { streamer, push: (e: CopilotEvent) => (queue.push(e), wake?.()) };
}

const type = async (text: string) => userEvent.type(screen.getByLabelText("Message to the copilot"), text);

describe("CopilotPanel", () => {
  it("is registered as a dock tab", () => {
    renderApp(<Dock />);
    expect(screen.getByRole("tab", { name: "Copilot" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the empty state with example requests that fill the input", async () => {
    renderApp(<CopilotPanel />);
    expect(screen.getByLabelText("Example requests")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New chat" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: EXAMPLES[1] }));
    expect(screen.getByLabelText("Message to the copilot")).toHaveValue(EXAMPLES[1]);
  });

  it("shows the working indicator with a timer before any event arrives", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    controlled();
    renderApp(<CopilotPanel />);
    await type("hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByTestId("copilot-working")).toHaveTextContent("Working… 0s");
    expect(screen.getByText("hello")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByTestId("copilot-working")).toHaveTextContent("Working… 3s");
  });

  it("sends the working copy, streams steps and text, and disables the input meanwhile", async () => {
    const c = controlled();
    renderApp(<CopilotPanel />);
    await type("add a goodbye");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(c.streamer).toHaveBeenCalledWith("demo", "add a goodbye", agent, expect.any(AbortSignal));
    expect(screen.getByLabelText("Message to the copilot")).toBeDisabled();

    act(() => c.push({ event: "step", label: "Reading agent" }));
    act(() => c.push({ event: "text", delta: "Done" }));
    act(() => c.push({ event: "text", delta: "." }));
    expect(await screen.findByText("Reading agent")).toBeInTheDocument();
    expect(screen.getByText("Done.")).toBeInTheDocument();

    act(() => c.push({ event: "done" }));
    await waitFor(() => expect(screen.getByLabelText("Message to the copilot")).toBeEnabled());
    expect(screen.queryByTestId("copilot-working")).not.toBeInTheDocument();
  });

  it("Enter sends and Shift+Enter does not", async () => {
    const c = controlled();
    renderApp(<CopilotPanel />);
    await type("one{Shift>}{Enter}{/Shift}two");
    expect(c.streamer).not.toHaveBeenCalled();
    await type("{Enter}");
    expect(c.streamer).toHaveBeenCalledWith("demo", "one\ntwo", agent, expect.any(AbortSignal));
  });

  it("Stop ends the turn and re-enables the input", async () => {
    const c = controlled();
    renderApp(<CopilotPanel />);
    await type("go");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(screen.getByLabelText("Message to the copilot")).toBeEnabled());
    expect(c.streamer.mock.calls[0][3].aborted).toBe(true);
    expect(screen.getByText("Stopped.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("explains how to set up the Claude login when the backend is unavailable", async () => {
    const c = controlled();
    renderApp(<CopilotPanel />);
    await type("go");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    act(() => c.push({ event: "error", message: "no login", setup: true }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SETUP_HELP);
    expect(alert).toHaveTextContent("ANTHROPIC_API_KEY");
    expect(alert).toHaveTextContent("claude");
  });

  it("shows other errors as they are, and New chat clears the conversation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const c = controlled();
    renderApp(<CopilotPanel />);
    await type("go");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    act(() => c.push({ event: "error", message: "The copilot failed: boom" }));
    act(() => c.push({ event: "done" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The copilot failed: boom");
    await waitFor(() => expect(screen.getByLabelText("Message to the copilot")).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "New chat" }));
    await waitFor(() => expect(screen.getByLabelText("Example requests")).toBeInTheDocument());
  });

  it("does not hand React a cleanup value from the scroll effect", async () => {
    // Browsers' scrollIntoView can return a non-function; returning it from an effect crashes on unmount.
    const scroll = vi.fn(() => "not a function");
    Element.prototype.scrollIntoView = scroll as unknown as typeof Element.prototype.scrollIntoView;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = controlled();
    const { unmount } = renderApp(<CopilotPanel />);
    await type("go");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    act(() => c.push({ event: "step", label: "Reading agent" }));
    await screen.findByText("Reading agent");
    expect(scroll).toHaveBeenCalled();
    act(() => c.push({ event: "done" }));
    expect(() => unmount()).not.toThrow();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("keeps each agent's conversation when switching agents", async () => {
    const c = controlled();
    renderApp(<CopilotPanel />);
    await type("go");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    act(() => c.push({ event: "done" }));
    await waitFor(() => expect(screen.getByLabelText("Message to the copilot")).toBeEnabled());
    act(() => useAgentStore.setState({ agentId: "other" }));
    expect(screen.getByLabelText("Example requests")).toBeInTheDocument();
    act(() => useAgentStore.setState({ agentId: "demo" }));
    expect(screen.getByText("go")).toBeInTheDocument();
  });
});
