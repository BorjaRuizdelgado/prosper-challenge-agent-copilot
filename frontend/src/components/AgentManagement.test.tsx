import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../App";
import { json, mockApi, mockFetch, renderApp } from "../test/helpers";

const summary = { id: "a-1", name: "Scheduler", node_count: 4, updated_at: "2026-01-01T00:00:00Z" };
const record = (id: string, name: string) => ({
  id,
  agent: { name, nodes: [{ name: "greeting" }] },
  updated_at: "2026-01-02T00:00:00Z",
});

afterEach(() => vi.unstubAllGlobals());

/** In the editor the agents live in the switcher menu next to the agent's name. */
const openSwitcher = () => userEvent.click(screen.getByRole("button", { name: "Switch agent" }));

const calls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);

test("creating an agent adds it to the list and opens it at its own URL", async () => {
  const fetchMock = mockApi({
    "GET /api/agents": () => json([summary]),
    "POST /api/agents": () => json(record("new-1234", "Intake"), 201),
    "GET /api/agents/new-1234": () => json(record("new-1234", "Intake")),
  });
  renderApp(<App />);
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "New agent" }));
  const dialog = screen.getByRole("dialog", { name: "New agent" });
  expect(within(dialog).getByRole("button", { name: "Create" })).toBeDisabled();
  await userEvent.type(within(dialog).getByLabelText("Name"), "Intake");
  await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

  expect(await screen.findByRole("link", { name: /Intake/ })).toHaveAttribute("href", "/agents/new-1234");
  expect(await screen.findByRole("heading", { name: "Intake" })).toBeInTheDocument();
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(post[1]!.body as string)).toEqual({ name: "Intake" });
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
  const fetchMock = mockApi({
    "GET /api/agents": () => json([summary]),
    "POST /api/agents/a-1/duplicate": () => json(record("copy-9999", "Scheduler copy"), 201),
    "GET /api/agents/copy-9999": () => json(record("copy-9999", "Scheduler copy")),
  });
  renderApp(<App />);
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "Duplicate Scheduler" }));

  // The copy's list link only lives until the editor opens, so check where it ends up instead.
  expect(await screen.findByRole("heading", { name: "Scheduler copy" })).toBeInTheDocument();
  expect(calls(fetchMock)).toContain("POST /api/agents/a-1/duplicate");
  expect(calls(fetchMock)).toContain("GET /api/agents/copy-9999");
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
  const fetchMock = mockApi({
    "GET /api/agents": () => json([summary]),
    "GET /api/agents/a-1": () => json(record("a-1", "Scheduler")),
    "DELETE /api/agents/a-1": () => new Response(null, { status: 204 }),
  });
  renderApp(<App />, "/agents/a-1");
  expect(await screen.findByRole("heading", { name: "Scheduler" })).toBeInTheDocument();
  await openSwitcher();
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "Delete Scheduler" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(screen.queryByRole("link", { name: /Scheduler/ })).not.toBeInTheDocument());
  expect(calls(fetchMock)).toContain("DELETE /api/agents/a-1");
  await waitFor(() => expect(screen.getByRole("main")).toHaveTextContent("Select an agent"));
});

test("a failed delete brings the agent back and keeps the editor open", async () => {
  mockApi({
    "GET /api/agents": () => json([summary]),
    "GET /api/agents/a-1": () => json(record("a-1", "Scheduler")),
    "DELETE /api/agents/a-1": () => json({}, 500),
  });
  renderApp(<App />, "/agents/a-1");
  await screen.findByRole("heading", { name: "Scheduler" });
  await openSwitcher();
  await screen.findByRole("link", { name: /Scheduler/ });

  await userEvent.click(screen.getByRole("button", { name: "Delete Scheduler" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

  // The editor's own checks are a status too, so look for the toast by its text.
  expect(await screen.findByText("Could not delete the agent (500)")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Scheduler/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Scheduler" })).toBeInTheDocument();
});

const fullRecord = (name: string) => ({
  id: "a-1",
  agent: { name, initial_node: "greeting", nodes: [{ name: "greeting", task_messages: [], end: true }] },
  updated_at: "2026-01-02T00:00:00Z",
});

test("renaming the open agent from the switcher updates the editor, so its next save keeps the new name", async () => {
  mockApi({
    "GET /api/agents": () => json([summary]),
    "GET /api/agents/a-1": () => json(fullRecord("Scheduler")),
    "PUT /api/agents/a-1": () => json(fullRecord("Booker")),
    "POST /api/agents/validate": () => json([]),
  });
  const fetchMock = vi.mocked(fetch);
  renderApp(<App />, "/agents/a-1");
  await screen.findByRole("heading", { name: "Scheduler" });

  await openSwitcher();
  await userEvent.click(await screen.findByRole("button", { name: "Rename Scheduler" }));
  const input = within(screen.getByRole("dialog")).getByLabelText("Name");
  await userEvent.clear(input);
  await userEvent.type(input, "Booker{Enter}");

  expect(await screen.findByRole("heading", { name: "Booker" })).toBeInTheDocument();
  expect(screen.getByText("Saved")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Add node" }));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2));
  const saved = JSON.parse(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")[1][1]!.body as string);
  expect(saved).toMatchObject({ name: "Booker" });
});

test("saving from the editor updates the agent's name and node count in the switcher", async () => {
  mockApi({
    "GET /api/agents": () => json([{ ...summary, node_count: 1 }]),
    "GET /api/agents/a-1": () => json(fullRecord("Scheduler")),
    "PUT /api/agents/a-1": () => json(fullRecord("Front desk")),
    "POST /api/agents/validate": () => json([]),
  });
  renderApp(<App />, "/agents/a-1");
  await screen.findByRole("heading", { name: "Scheduler" });

  // With nothing selected, Build shows the agent's settings.
  const name = await screen.findByLabelText("Name");
  await userEvent.clear(name);
  await userEvent.type(name, "Front desk");
  await userEvent.click(screen.getByRole("button", { name: "Add node" }));
  await openSwitcher();
  expect(screen.getByRole("link", { name: /Scheduler/ })).toHaveTextContent("1 node");

  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Front desk"));
  await openSwitcher();
  const link = await screen.findByRole("link", { name: /Front desk/ });
  expect(link).toHaveTextContent("2 nodes");
});
