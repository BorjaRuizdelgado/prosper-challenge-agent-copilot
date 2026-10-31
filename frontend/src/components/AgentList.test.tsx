import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { json, mockFetch, renderApp } from "../test/helpers";
import { AgentList } from "./AgentList";

const agents = [{ id: "a-1", name: "Scheduler", node_count: 4, updated_at: "2026-01-01T00:00:00Z" }];

const renderList = () => renderApp(<AgentList />);

afterEach(() => vi.unstubAllGlobals());

test("shows loading, then the agents as links to their editor", async () => {
  mockFetch(json(agents));
  renderList();

  expect(screen.getByText("Loading agents…")).toBeInTheDocument();
  const link = await screen.findByRole("link", { name: /Scheduler/ });
  expect(link).toHaveAttribute("href", "/agents/a-1");
  expect(link).toHaveTextContent("4 nodes");
});

test("shows an empty state when there are no agents", async () => {
  mockFetch(json([]));
  renderList();

  expect(await screen.findByText(/No agents yet/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "New agent" })).toBeInTheDocument();
});

test("shows an error and retries on demand", async () => {
  const fetchMock = mockFetch(json({}, 500), json(agents));
  renderList();

  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load agents (500)");

  await userEvent.click(screen.getByRole("button", { name: "Retry" }));

  await waitFor(() => expect(screen.getByRole("link", { name: /Scheduler/ })).toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
