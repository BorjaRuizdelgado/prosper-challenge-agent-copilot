import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
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
