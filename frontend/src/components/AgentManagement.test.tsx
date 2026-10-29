import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../App";
import { json, mockFetch, renderApp } from "../test/helpers";

const summary = { id: "a-1", name: "Scheduler", node_count: 4, updated_at: "2026-01-01T00:00:00Z" };
const record = (id: string, name: string) => ({
  id,
  agent: { name, nodes: [{ name: "greeting" }] },
  updated_at: "2026-01-02T00:00:00Z",
});

afterEach(() => vi.unstubAllGlobals());

const calls = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);

test("creating an agent adds it to the list and opens it at its own URL", async () => {
  const fetchMock = mockFetch(json([summary]), json(record("new-1234", "Intake"), 201));
  renderApp(<App />);
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "New agent" }));
  const dialog = screen.getByRole("dialog", { name: "New agent" });
  expect(within(dialog).getByRole("button", { name: "Create" })).toBeDisabled();
  await userEvent.type(within(dialog).getByLabelText("Name"), "Intake");
  await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  expect(await screen.findByRole("link", { name: /Intake/ })).toHaveAttribute("href", "/agents/new-1234");
  expect(screen.getByRole("main")).toHaveTextContent("new-1234");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ name: "Intake" });
});

test("a failed create shows a toast and leaves the list alone", async () => {
  mockFetch(json([summary]), json({}, 500));
  renderApp(<App />);
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "New agent" }));
  await userEvent.type(screen.getByLabelText("Name"), "Intake");
  await userEvent.click(screen.getByRole("button", { name: "Create" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Could not create the agent (500)");
  expect(screen.queryByRole("link", { name: /Intake/ })).not.toBeInTheDocument();
});

test("renaming updates the list at once and saves the renamed document", async () => {
  const fetchMock = mockFetch(json([summary]), json(record("a-1", "Scheduler")), json(record("a-1", "Booker")));
  renderApp(<App />);
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "Rename Scheduler" }));
  const input = screen.getByLabelText("Name");
  expect(input).toHaveValue("Scheduler");
  await userEvent.clear(input);
  await userEvent.type(input, "Booker");
  await userEvent.click(screen.getByRole("button", { name: "Rename" }));

  expect(screen.getByRole("link", { name: /Booker/ })).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(calls(fetchMock)).toEqual(["GET /api/agents", "GET /api/agents/a-1", "PUT /api/agents/a-1"]);
  expect(JSON.parse(fetchMock.mock.calls[2][1].body).name).toBe("Booker");
});

test("a failed rename restores the old name and toasts", async () => {
  mockFetch(json([summary]), json({}, 500));
  renderApp(<App />);
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "Rename Scheduler" }));
  await userEvent.clear(screen.getByLabelText("Name"));
  await userEvent.type(screen.getByLabelText("Name"), "Booker");
  await userEvent.click(screen.getByRole("button", { name: "Rename" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Could not load the agent (500)");
  expect(screen.getByRole("link", { name: /Scheduler/ })).toBeInTheDocument();
});

test("duplicating adds the copy and opens it", async () => {
  const fetchMock = mockFetch(json([summary]), json(record("copy-9999", "Scheduler copy"), 201));
  renderApp(<App />);
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "Duplicate Scheduler" }));

  expect(await screen.findByRole("link", { name: /Scheduler copy/ })).toHaveAttribute("href", "/agents/copy-9999");
  expect(calls(fetchMock)[1]).toBe("POST /api/agents/a-1/duplicate");
  expect(screen.getByRole("main")).toHaveTextContent("copy-9999");
});

test("delete needs confirmation, and cancelling deletes nothing", async () => {
  const fetchMock = mockFetch(json([summary]));
  renderApp(<App />);
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "Delete Scheduler" }));
  expect(screen.getByRole("dialog", { name: "Delete agent" })).toHaveTextContent('Delete "Scheduler"?');
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Scheduler/ })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("confirming delete removes the agent and leaves its editor", async () => {
  const fetchMock = mockFetch(json([summary]), new Response(null, { status: 204 }));
  renderApp(<App />, "/agents/a-1");
  await screen.findByRole("link", { name: /Scheduler/ });
  expect(screen.getByRole("main")).toHaveTextContent("a-1");

  await userEvent.click(screen.getByRole("button", { name: "Delete Scheduler" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(screen.queryByRole("link", { name: /Scheduler/ })).not.toBeInTheDocument());
  expect(calls(fetchMock)[1]).toBe("DELETE /api/agents/a-1");
  await waitFor(() => expect(screen.getByRole("main")).toHaveTextContent("Select an agent"));
});

test("a failed delete brings the agent back and keeps the editor open", async () => {
  mockFetch(json([summary]), json({}, 500));
  renderApp(<App />, "/agents/a-1");
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "Delete Scheduler" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Could not delete the agent (500)");
  expect(screen.getByRole("link", { name: /Scheduler/ })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveTextContent("a-1");
});
