import { screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { App } from "./App";
import { json, mockFetch, renderApp } from "./test/helpers";

afterEach(() => vi.unstubAllGlobals());

test("renders the home page with the product mark and the agents", () => {
  mockFetch(json([]));
  renderApp(<App />);

  expect(screen.getByText("Prosper")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "Voice agents" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveTextContent("Select an agent");
});
