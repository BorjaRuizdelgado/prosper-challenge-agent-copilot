import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BUILD_FROM_GUIDELINES, chatOf, resetCopilotStore, setCopilotStreamer, useCopilotStore } from "../copilot/copilotStore";
import { json, mockApi, renderApp } from "../test/helpers";
import { AgentList } from "./AgentList";

const sample = { name: "maple-family-practice", text: "Hours: 9 to 5.\nTwo providers.", reply: "Reply" };
const small = { name: "harbor-dental-reschedule", text: "Cancel or move a visit.", reply: "Small reply" };
const record = {
  id: "new-1",
  agent: { name: "Maple Family Practice", initial_node: "greeting", nodes: [{ name: "greeting" }] },
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  resetCopilotStore();
  mockApi({
    "GET /api/agents": () => json([]),
    "GET /api/demo/guidelines": () => json([small, sample]),
    "POST /api/agents": () => json(record, 201),
  });
});
afterEach(() => vi.unstubAllGlobals());

const open = async () => {
  renderApp(<AgentList />);
  await userEvent.click(await screen.findByRole("button", { name: "New from guidelines" }));
};

test("is offered in the empty state too", async () => {
  renderApp(<AgentList />);
  expect(await screen.findByText(/No agents yet/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "New from guidelines" })).toBeInTheDocument();
});

test("accepts a .md file: fills the text and defaults the name", async () => {
  await open();
  const file = new File(["# Hours\nOpen 9-5"], "maple-family.md", { type: "text/markdown" });
  await userEvent.upload(screen.getByLabelText("Guidelines file"), file);

  await waitFor(() => expect(screen.getByLabelText("Guidelines")).toHaveValue("# Hours\nOpen 9-5"));
  expect(screen.getByLabelText("Name")).toHaveValue("Maple Family");
});

test("rejects other file types and creates nothing", async () => {
  await open();
  const pdf = new File(["%PDF"], "policy.pdf", { type: "application/pdf" });
  await userEvent.upload(screen.getByLabelText("Guidelines file"), pdf, { applyAccept: false });

  expect(await screen.findByRole("alert")).toHaveTextContent("Only text and Markdown files");
  expect(screen.getByLabelText("Guidelines")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Create and build" })).toBeDisabled();
});

test("offers one button per sample, in API order", async () => {
  await open();
  const buttons = await screen.findAllByRole("button", { name: /^Use sample:/ });
  expect(buttons.map((b) => b.textContent)).toEqual(["Use sample: Harbor Dental Reschedule", "Use sample: Maple Family Practice"]);
});

test("picking the second sample fills the text and keeps a name already typed", async () => {
  await open();
  await userEvent.type(screen.getByLabelText("Name"), "My clinic");
  await userEvent.click(await screen.findByRole("button", { name: "Use sample: Maple Family Practice" }));

  expect(screen.getByLabelText("Guidelines")).toHaveValue(sample.text);
  expect(screen.getByLabelText("Name")).toHaveValue("My clinic");
  await userEvent.click(screen.getByRole("button", { name: "Use sample: Harbor Dental Reschedule" }));
  expect(screen.getByLabelText("Guidelines")).toHaveValue(small.text);
  expect(screen.getByLabelText("Name")).toHaveValue("My clinic");
});

test("a sample fills the name and text", async () => {
  await open();
  await userEvent.click(await screen.findByRole("button", { name: "Use sample: Maple Family Practice" }));

  await waitFor(() => expect(screen.getByLabelText("Guidelines")).toHaveValue(sample.text));
  expect(screen.getByLabelText("Name")).toHaveValue("Maple Family Practice");
  expect(screen.getByRole("button", { name: "Create and build" })).toBeEnabled();
});

test("confirming creates with the guidelines, navigates and sends the build message once", async () => {
  const calls: string[] = [];
  const restore = setCopilotStreamer(async function* (_id, message) {
    calls.push(message);
    yield { event: "done" } as never;
  });
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const { router } = renderApp(<AgentList />);
  await userEvent.click(await screen.findByRole("button", { name: "New from guidelines" }));
  await userEvent.click(await screen.findByRole("button", { name: "Use sample: Maple Family Practice" }));
  await waitFor(() => expect(screen.getByLabelText("Guidelines")).toHaveValue(sample.text));
  await userEvent.click(screen.getByRole("button", { name: "Create and build" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/agents/new-1"));
  await waitFor(() => expect(calls).toEqual([BUILD_FROM_GUIDELINES]));
  const post = fetchMock.mock.calls.find((c) => c[0] === "/api/agents" && c[1]?.method === "POST")!;
  expect(JSON.parse(post[1].body)).toEqual({ name: "Maple Family Practice", guidelines: sample.text });

  const user = chatOf(useCopilotStore.getState().chats, "new-1").messages[0];
  expect(user).toMatchObject({ role: "user", text: BUILD_FROM_GUIDELINES, guidelines: { name: "Maple Family Practice", words: 6 } });
  restore();
});
