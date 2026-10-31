import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECK_COVERAGE, chatOf, resetCopilotStore, setCopilotStreamer, useCopilotStore } from "../copilot/copilotStore";
import type { Agent, Coverage } from "../model";
import { useAgentStore } from "../store";
import { json, mockApi, renderApp } from "../test/helpers";
import { CopilotPanel } from "./CopilotPanel";
import { coverageLine, questionsEmail } from "./CoverageCard";

const agent: Agent = { name: "Maple", initial_node: "greeting", nodes: [{ name: "greeting" }, { name: "cancel" }] };
const coverage: Coverage = {
  requirements: [
    { id: "r1", text: "Book visits", quote: "We book visits.", status: "covered", nodes: ["greeting"] },
    { id: "r2", text: "Cancel with notice", quote: "", status: "default", nodes: ["cancel", "greeting"], note: "No window stated" },
    { id: "r3", text: "Nurse line", quote: "Call our nurse line.", status: "open", nodes: [] },
  ],
  questions: [
    { id: "q1", question: "How much notice is needed to cancel?", default: "Hand off to staff", requirements: ["r2"] },
    { id: "q2", question: "What is the nurse line number?", default: "Say staff will call back", requirements: ["r3"] },
  ],
};

function seed(c: Coverage = coverage, running = false) {
  useCopilotStore.setState({
    chats: {
      demo: {
        messages: [
          { role: "user", text: "Build" },
          { role: "assistant", text: "Done.", steps: [], coverage: c },
        ],
        running,
        startedAt: null,
        focus: null,
        review: null,
      },
    },
  });
}

const sample = { name: "maple", text: "Sample guidelines.", reply: "Sample client reply." };
const small = { name: "harbor", text: "Small sample guidelines.", reply: "Small client reply." };
function guidelines(text: string | null) {
  mockApi({
    "GET /api/agents/demo/guidelines": () => (text === null ? json({}, 404) : json({ text })),
    "GET /api/demo/guidelines": () => json([small, sample]),
  });
}

beforeEach(() => {
  resetCopilotStore();
  useAgentStore.setState({ agentId: "demo", agent, dirty: false, dockTab: "copilot", selection: null });
  guidelines("My own guidelines.");
});
afterEach(() => vi.unstubAllGlobals());

describe("coverage text", () => {
  it("counts covered and default requirements as handled", () => {
    expect(coverageLine(coverage.requirements, 2)).toBe("Covers 2 of 3 requirements · 2 questions for the client");
    expect(coverageLine(coverage.requirements.slice(0, 1), 0)).toBe("Covers 1 of 1 requirement");
  });

  it("formats the questions as an email with the default in place", () => {
    const text = questionsEmail("Maple", coverage.questions);
    expect(text).toContain('"Maple"');
    expect(text).toContain("1. How much notice is needed to cancel?\n   For now the agent will: Hand off to staff");
    expect(text).toContain("2. What is the nurse line number?\n   For now the agent will: Say staff will call back");
  });
});

describe("CoverageCard", () => {
  it("shows the count and the requirements grouped by status", () => {
    seed();
    renderApp(<CopilotPanel />);
    const card = screen.getByRole("region", { name: "Coverage" });
    expect(card).toHaveTextContent("Covers 2 of 3 requirements · 2 questions for the client");
    expect(screen.getByRole("heading", { name: "Covered (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Covered with a default (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open (1)" })).toBeInTheDocument();
    expect(card).toHaveTextContent("No window stated");
  });

  it("lists the questions with their defaults", () => {
    seed();
    renderApp(<CopilotPanel />);
    expect(screen.getByText("How much notice is needed to cancel?")).toBeInTheDocument();
    expect(screen.getByText("Default: Hand off to staff")).toBeInTheDocument();
  });

  it("focuses a node chip's node on hover and selects it on click", async () => {
    seed();
    renderApp(<CopilotPanel />);
    const focus = () => chatOf(useCopilotStore.getState().chats, "demo").focus;
    const chip = screen.getByRole("button", { name: "cancel" });
    await userEvent.hover(chip);
    expect(focus()).toBe("cancel");
    await userEvent.unhover(chip);
    expect(focus()).toBeNull();
    await userEvent.click(chip);
    expect(useAgentStore.getState().selection).toEqual({ kind: "node", node: "cancel" });
    expect(useAgentStore.getState().dockTab).toBe("inspector");
  });

  it("copies the questions as an email and says so", async () => {
    seed();
    const user = userEvent.setup();
    renderApp(<CopilotPanel />);
    await user.click(screen.getByRole("button", { name: "Copy as email" }));
    expect(await navigator.clipboard.readText()).toBe(questionsEmail("Maple", coverage.questions));
    expect(await screen.findByText(/Questions copied/)).toBeInTheDocument();
  });

  it("re-checks coverage by sending the fixed message", async () => {
    seed();
    const sent: string[] = [];
    const restore = setCopilotStreamer(async function* (_id, message) {
      sent.push(message);
      yield { event: "done" };
    });
    renderApp(<CopilotPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Re-check coverage" }));
    await waitFor(() => expect(sent).toEqual([CHECK_COVERAGE]));
    restore();
  });

  it("does not offer Re-check coverage while a turn runs", () => {
    seed(coverage, true);
    renderApp(<CopilotPanel />);
    expect(screen.getByRole("button", { name: "Re-check coverage" })).toBeDisabled();
  });

  it("hides Copy as email when there are no questions", () => {
    seed({ ...coverage, questions: [] });
    renderApp(<CopilotPanel />);
    expect(screen.queryByRole("button", { name: "Copy as email" })).not.toBeInTheDocument();
  });

  it("offers the sample client reply only for sample guidelines, and only prefills it", async () => {
    seed();
    guidelines(sample.text);
    const sent = vi.fn();
    const restore = setCopilotStreamer(async function* (...args) {
      sent(args);
      yield { event: "done" };
    });
    renderApp(<CopilotPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Use sample client reply" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message to the copilot" })).toHaveValue(sample.reply));
    expect(sent).not.toHaveBeenCalled();
    restore();
  });

  it("offers each sample's own reply, whichever sample the guidelines equal", async () => {
    seed();
    guidelines(small.text);
    renderApp(<CopilotPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Use sample client reply" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message to the copilot" })).toHaveValue(small.reply));
  });

  it("does not offer the sample reply for edited sample text", async () => {
    seed();
    guidelines(`${small.text} Edited.`);
    renderApp(<CopilotPanel />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/demo/guidelines", expect.anything()));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: "Use sample client reply" })).not.toBeInTheDocument();
  });

  it("does not offer the sample reply for the user's own guidelines", async () => {
    seed();
    renderApp(<CopilotPanel />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/demo/guidelines", expect.anything()));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: "Use sample client reply" })).not.toBeInTheDocument();
  });

  it("does not offer the sample reply for an agent without guidelines", async () => {
    seed();
    guidelines(null);
    renderApp(<CopilotPanel />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/demo/guidelines", expect.anything()));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: "Use sample client reply" })).not.toBeInTheDocument();
  });
});
