import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { worstSeverity } from "../issues";
import type { Agent, Issue } from "../model";
import { blockingIssues, useAgentStore } from "../store";
import { json, mockApi } from "../test/helpers";
import { useValidation } from "../useValidation";
import { IssuesPanel } from "./IssuesPanel";

const agent = (): Agent => ({
  name: "A",
  initial_node: "a",
  nodes: [{ name: "a", edges: [{ function: "go", description: "d", target: "ghost" }] }],
});

const issues: Issue[] = [
  { severity: "error", code: "unknown-target", message: "Edge 'go' in node 'a' targets unknown node 'ghost'.", node: "a", edge: "go" },
  { severity: "warning", code: "unreachable", message: "Node 'b' cannot be reached from the initial node.", node: "b" },
  { severity: "warning", code: "no-terminal", message: "No node ends the call." },
];

beforeEach(() => useAgentStore.setState({ status: "ready", agent: agent(), issues: [], validated: false, selection: null, dockTab: "issues" }));
afterEach(() => vi.unstubAllGlobals());

function Harness() {
  useValidation(10);
  return <IssuesPanel />;
}

test("shows errors and warnings and selects the element an issue points at", async () => {
  useAgentStore.setState({ issues, validated: true });
  render(<IssuesPanel />);

  expect(screen.getAllByText(/error|warning/)).toHaveLength(3);
  await userEvent.click(screen.getByRole("button", { name: /targets unknown node/ }));
  expect(useAgentStore.getState().selection).toEqual({ kind: "edge", node: "a", function: "go" });
  await userEvent.click(screen.getByRole("button", { name: /cannot be reached/ }));
  expect(useAgentStore.getState().selection).toEqual({ kind: "node", node: "b" });
  expect(screen.getByText("No node ends the call.").closest("button")).toBeNull();
});

test("a valid agent shows a clear No issues state", () => {
  useAgentStore.setState({ issues: [], validated: true });
  render(<IssuesPanel />);

  expect(screen.getByText("No issues")).toBeInTheDocument();
});

test("settled edits are validated by the backend and the result is stored", async () => {
  const fetch = mockApi({ "POST /api/agents/validate": () => json(issues) });
  render(<Harness />);

  expect(await screen.findByText(/targets unknown node/)).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual(agent());
});

test("rapid edits are debounced into one request", async () => {
  const fetch = mockApi({ "POST /api/agents/validate": () => json([]) });
  render(<Harness />);
  for (const name of ["B", "C", "D"]) act(() => useAgentStore.getState().updateSettings({ name }));

  await screen.findByText("No issues");
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("a failed validation request keeps the old issues and says they may be stale", async () => {
  useAgentStore.setState({ issues, validated: true });
  mockApi({ "POST /api/agents/validate": () => json({}, 500) });
  render(<Harness />);

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Validation is unavailable"));
  expect(screen.getByText(/targets unknown node/)).toBeInTheDocument();
});

test("worstSeverity ranks errors above warnings and separates node from edge issues", () => {
  expect(worstSeverity(issues, "a")).toBeNull();
  expect(worstSeverity(issues, "a", "go")).toBe("error");
  expect(worstSeverity(issues, "b")).toBe("warning");
  expect(blockingIssues(issues)).toHaveLength(1);
});
