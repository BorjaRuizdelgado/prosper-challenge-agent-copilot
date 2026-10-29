import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

test("renders the shell with the product mark and an empty sheet", () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByText("Agent Builder")).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveTextContent("Select an agent");
});
