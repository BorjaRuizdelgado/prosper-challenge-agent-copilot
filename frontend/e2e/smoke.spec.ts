import { expect, test } from "@playwright/test";

// create -> edit -> save -> reload, against the real API with a temp agents dir.
test("create, edit, save and reload an agent", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: /new agent/i }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Smoke agent");
  await page.getByRole("button", { name: /^create/i }).click();
  await expect(page).toHaveURL(/\/agents\/smoke-agent/);

  await page.getByRole("button", { name: "Add node" }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Unsaved changes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");

  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.screenshot({ path: `test-results/editor-${width}.png` });
  }
  // the seeded example: graph with edges, a selected node, and the Call tab
  await page.getByRole("link", { name: /Prosper Scheduler/ }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.locator(".react-flow__node").first().click();
  await page.screenshot({ path: "test-results/seeded-selected.png" });
  await page.getByRole("tab", { name: "Call" }).click();
  await page.screenshot({ path: "test-results/seeded-call.png" });
  expect(errors).toEqual([]);
});

// The copilot turn is stubbed at the network edge (no Claude login needed): the real UI, store and
// canvas run against a canned SSE stream that adds a node to whatever agent the page sends.
test("copilot: send, see steps, apply the proposal, see the new node", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  let sentMessage = "";
  await page.route("**/api/copilot/*", async (route) => {
    const body = route.request().postDataJSON() as { message: string; agent: { nodes: Array<Record<string, unknown>> } };
    sentMessage = body.message;
    const agent = structuredClone(body.agent) as typeof body.agent & { initial_node: string };
    const first = agent.nodes[0] as { edges?: Array<Record<string, unknown>> };
    agent.nodes.push({
      name: "farewell",
      task_messages: [{ role: "developer", content: "Say goodbye and thank the caller." }],
      post_actions: [{ type: "end_conversation" }],
    });
    first.edges = [...(first.edges ?? []), { function: "say_goodbye", description: "The caller is done.", target: "farewell" }];
    const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        sse("step", { label: "Reading the agent" }),
        sse("step", { label: "Adding node farewell", node: "farewell" }),
        sse("draft", { agent }),
        sse("text", { delta: "Added a farewell " }),
        sse("text", { delta: "node." }),
        sse("proposal", { agent, issues: [] }),
        sse("done", {}),
      ].join(""),
    });
  });

  await page.goto("/");
  await page.getByRole("link", { name: /Prosper Scheduler/ }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  await page.getByRole("tab", { name: "Copilot" }).click();
  await page.getByRole("textbox", { name: "Message to the copilot" }).fill("Add a goodbye node");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("list", { name: "Steps" }).getByText("Adding node farewell")).toBeVisible();
  await expect(page.getByText("Added a farewell node.")).toBeVisible();
  expect(sentMessage).toBe("Add a goodbye node");
  await expect(page.getByText("1 node added, 1 edge added")).toBeVisible();

  // review: the draft is on the canvas, the working copy is untouched
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(page.getByTestId("save-status")).toHaveText("Saved");

  await page.getByRole("region", { name: "Proposal" }).getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Applied.")).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Unsaved changes");
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(page.locator(".react-flow__node", { hasText: "farewell" })).toBeVisible();
  await page.screenshot({ path: "test-results/copilot-applied.png" });
  expect(errors).toEqual([]);
});
