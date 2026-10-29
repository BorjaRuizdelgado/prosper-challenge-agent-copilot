import { screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { App } from "./App";
import { json, mockFetch, renderApp } from "./test/helpers";

afterEach(() => vi.unstubAllGlobals());

test("renders the shell with the product mark and an empty sheet", () => {
  mockFetch(json([]));
  renderApp(<App />);

  expect(screen.getByText("Agent Builder")).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveTextContent("Select an agent");
});
