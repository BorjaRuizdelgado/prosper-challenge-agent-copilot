import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCallStore, setCallClientFactory } from "../call/callStore";
import { fakeClientFactory } from "../call/fakeClient";
import { useAgentStore } from "../store";
import { renderApp } from "../test/helpers";
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
