import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CHECK_COVERAGE, resetCopilotStore, setCopilotStreamer } from "../copilot/copilotStore";
import { json, mockApi } from "../test/helpers";
import type { Agent } from "../model";
import { useAgentStore } from "../store";
import { SettingsForm } from "./SettingsForm";

const agent = (): Agent => ({
  name: "Scheduler",
  persona: "Warm.",
  voice_id: "21m00Tcm4TlvDq8ikWAM",
  model: "gpt-4o",
  initial_node: "a",
  nodes: [{ name: "a" }],
});

const current = () => useAgentStore.getState().agent!;

beforeEach(() => {
  useAgentStore.setState({ status: "ready", agent: agent(), positions: {}, dirty: false });
  render(<SettingsForm />);
});

test("shows the current settings", () => {
  expect(screen.getByLabelText("Name")).toHaveValue("Scheduler");
  expect(screen.getByLabelText("Persona")).toHaveValue("Warm.");
  expect(screen.getByLabelText("Voice")).toHaveDisplayValue("Rachel");
  expect(screen.getByLabelText("Model")).toHaveDisplayValue("gpt-4o");
});

test("edits name and persona and marks the agent dirty", () => {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Booker" } });
  fireEvent.change(screen.getByLabelText("Persona"), { target: { value: "Brisk." } });

  expect(current()).toMatchObject({ name: "Booker", persona: "Brisk." });
  expect(useAgentStore.getState().dirty).toBe(true);
});

test("selecting another voice updates voice_id", async () => {
  await userEvent.selectOptions(screen.getByLabelText("Voice"), "Adam");

  expect(current().voice_id).toBe("pNInz6obpgDQGcFmaJgB");
});

test("a custom voice id is typed in and stored", async () => {
  await userEvent.selectOptions(screen.getByLabelText("Voice"), "Custom…");
  fireEvent.change(screen.getByLabelText("Custom voice"), { target: { value: "my-voice-123" } });

  expect(current().voice_id).toBe("my-voice-123");
  expect(screen.getByLabelText("Voice")).toHaveDisplayValue("Custom…");
});

test("a stored value outside the list opens as custom", () => {
  cleanup();
  useAgentStore.setState({ agent: { ...agent(), model: "gpt-9" } });
  render(<SettingsForm />);

  expect(screen.getByLabelText("Custom model")).toHaveValue("gpt-9");
});

test("choosing a curated model after a custom one replaces it", async () => {
  cleanup();
  useAgentStore.setState({ agent: { ...agent(), model: "gpt-9" } });
  render(<SettingsForm />);
  await userEvent.selectOptions(screen.getByLabelText("Model"), "gpt-4o-mini");

  expect(current().model).toBe("gpt-4o-mini");
});

// Client guidelines section
const withGuidelines = (text: string | null) => {
  const puts: unknown[] = [];
  mockApi({
    "GET /api/agents/g-1/guidelines": () => (text === null ? json({}, 404) : json({ text })),
    "PUT /api/agents/g-1/guidelines": () => json({ text: "x" }),
  });
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  cleanup();
  useAgentStore.setState({ status: "ready", agent: agent(), agentId: "g-1", positions: {}, dirty: false, copilotOpen: false });
  render(<SettingsForm />);
  return { puts, fetchMock };
};

afterEach(() => vi.unstubAllGlobals());

test("saving guidelines calls the api and leaves the dirty flag alone", async () => {
  const { fetchMock } = withGuidelines("Open 9-5.");
  expect(await screen.findByText("Open 9-5.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  const box = screen.getByLabelText("Guidelines text");
  await userEvent.clear(box);
  await userEvent.type(box, "Open 8-6.");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.getByText("Open 8-6.")).toBeInTheDocument());
  const put = fetchMock.mock.calls.find((c) => c[1]?.method === "PUT")!;
  expect(put[0]).toBe("/api/agents/g-1/guidelines");
  expect(JSON.parse(put[1].body)).toEqual({ text: "Open 8-6." });
  expect(useAgentStore.getState().dirty).toBe(false);
});

test("an agent without guidelines offers to add them", async () => {
  withGuidelines(null);
  expect(await screen.findByRole("button", { name: "Add guidelines" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Check coverage" })).not.toBeInTheDocument();
});

test("Check coverage opens the Copilot and sends the fixed message once", async () => {
  resetCopilotStore();
  const calls: string[] = [];
  const restore = setCopilotStreamer(async function* (_id, message) {
    calls.push(message);
    yield { event: "done" } as never;
  });
  withGuidelines("Open 9-5.");
  await userEvent.click(await screen.findByRole("button", { name: "Check coverage" }));

  await waitFor(() => expect(calls).toEqual([CHECK_COVERAGE]));
  expect(useAgentStore.getState().copilotOpen).toBe(true);
  restore();
});
