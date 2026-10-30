import { type ConsoleMessage, expect, test } from "@playwright/test";

// An agent without guidelines answers 404 on purpose (the settings section then offers to add some); the browser logs that as a console error.
const isNoGuidelines = (m: ConsoleMessage) => m.location().url.endsWith("/guidelines");

// create -> edit -> save -> reload, against the real API with a temp agents dir.
test("create, edit, save and reload an agent", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !isNoGuidelines(m) && errors.push(m.text()));
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
  // the seeded example, opened from the agent switcher: graph with edges, a selected node, and the Test call tab
  await page.getByRole("button", { name: "Switch agent" }).click();
  await page.getByRole("link", { name: /Prosper Scheduler/ }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.locator(".react-flow__node").first().click();
  await page.screenshot({ path: "test-results/seeded-selected.png" });
  await page.getByRole("tab", { name: "Test call" }).click();
  await page.screenshot({ path: "test-results/seeded-call.png" });
  expect(errors).toEqual([]);
});

// The copilot turn is stubbed at the network edge (no Claude login needed): the real UI, store and
// canvas run against a canned SSE stream that adds a node to whatever agent the page sends.
test("copilot: send, see steps, apply the proposal, see the new node", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !isNoGuidelines(m) && errors.push(m.text()));
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

  // The copilot panel is open beside the canvas.
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

// Production runs review: both /runs and the copilot turn are stubbed at the network edge. The stream carries a
// findings event and a proposal that adds a node, so the whole flow runs on the real UI: select a run (canvas
// highlight), Analyze, findings card, a run link, Apply, the new node.
test("runs: select a run, analyze, see findings, open a run from one, apply the fix", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !isNoGuidelines(m) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  const runs = [
    {
      id: "r-9002",
      started_at: "2026-10-21T10:00:00Z",
      duration_s: 70,
      outcome: "abandoned",
      flag: "Caller wanted to cancel and could not.",
      transcript: [
        { speaker: "agent", text: "Would you like to book an appointment?" },
        { speaker: "caller", text: "I need to cancel instead." },
      ],
      path: [{ node: "greeting" }],
    },
    {
      id: "r-9001",
      started_at: "2026-10-20T09:00:00Z",
      duration_s: 96,
      outcome: "stuck",
      transcript: [
        { speaker: "agent", text: "Would you like to book an appointment?" },
        { speaker: "caller", text: "Yes please." },
      ],
      path: [{ node: "greeting" }, { node: "collect_details", via: "choose_intent", args: {} }],
    },
  ];
  await page.route("**/api/agents/*/runs", (route) => route.fulfill({ json: runs }));

  // The review replays on its own; this test is about findings, so replay answers "no key" and never reaches OpenAI.
  await page.route("**/api/agents/*/replay", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `event: error\ndata: ${JSON.stringify({ message: "Replay needs OPENAI_API_KEY in backend/.env.", setup: true })}\n\nevent: done\ndata: {}\n\n`,
    }),
  );

  let sentMessage = "";
  await page.route("**/api/copilot/*", async (route) => {
    const body = route.request().postDataJSON() as { message: string; agent: { nodes: Array<Record<string, unknown>> } };
    sentMessage = body.message;
    const agent = structuredClone(body.agent) as typeof body.agent & { initial_node: string };
    const first = agent.nodes[0] as { edges?: Array<Record<string, unknown>> };
    agent.nodes.push({
      name: "cancel_appointment",
      task_messages: [{ role: "developer", content: "Help the caller cancel their appointment." }],
      post_actions: [{ type: "end_conversation" }],
    });
    first.edges = [...(first.edges ?? []), { function: "cancel", description: "The caller wants to cancel.", target: "cancel_appointment" }];
    const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        sse("step", { label: "Reading the agent" }),
        sse("step", { label: "Reporting 1 findings" }),
        sse("findings", {
          findings: [
            {
              title: "No way to cancel",
              runs: ["r-9002"],
              cause: "The greeting only offers booking.",
              fix: "Add a cancel path from the greeting.",
              node: "greeting",
            },
          ],
        }),
        sse("draft", { agent }),
        sse("text", { delta: "Added a cancel path." }),
        sse("proposal", { agent, issues: [] }),
        sse("done", {}),
      ].join(""),
    });
  });

  await page.goto("/");
  await page.getByRole("link", { name: /Prosper Scheduler/ }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  await page.getByRole("tab", { name: "Runs" }).click();
  await expect(page.getByTestId("runs-summary")).toContainText("Runs2");
  await expect(page.getByTestId("runs-summary")).toContainText("Flagged1");
  await page.getByRole("button", { name: /stuck/ }).click();
  await expect(page.locator('.react-flow__node [data-run="end"]')).toContainText("collect_details");
  await expect(page.locator('.react-flow__node [data-run="visited"]')).toContainText("greeting");
  await page.screenshot({ path: "test-results/runs-highlight.png" });

  await page.getByRole("button", { name: "Analyze runs" }).click();
  await expect(page.getByRole("region", { name: "Findings" }).getByText("No way to cancel")).toBeVisible();
  expect(sentMessage).toContain("production runs");
  await expect(page.locator(".react-flow__node")).toHaveCount(5);

  await page.getByRole("region", { name: "Findings" }).getByRole("button", { name: "r-9002" }).click();
  await expect(page.getByRole("tab", { name: "Runs" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: /abandoned/ })).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("region", { name: "Proposal" }).getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Unsaved changes");
  await expect(page.locator(".react-flow__node", { hasText: "cancel_appointment" })).toBeVisible();
  await page.screenshot({ path: "test-results/runs-applied.png" });
  expect(errors).toEqual([]);
});

// Replay: /runs, the copilot turn and /replay are all stubbed at the network edge (no OpenAI call is made). The
// turn ends with findings and a proposal, so the replay card fills in by itself; opening a row draws the replayed
// path on the proposal; with the draft still on the canvas "Replay this call" is disabled; after Apply it runs.
test("replay: card shows Fixed, a row draws its path, Replay this call is disabled during a draft", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !isNoGuidelines(m) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  const line = (speaker: string, text: string) => ({ speaker, text });
  const runs = [
    {
      id: "r-9002", started_at: "2026-10-21T10:00:00Z", duration_s: 70, outcome: "abandoned", flag: "Caller wanted to cancel and could not.",
      goal: "Cancel the Friday appointment",
      transcript: [line("agent", "Would you like to book an appointment?"), line("caller", "I need to cancel instead.")],
      path: [{ node: "greeting" }],
    },
    {
      id: "r-9003", started_at: "2026-10-20T09:00:00Z", duration_s: 90, outcome: "completed", goal: "Book a checkup",
      transcript: [line("agent", "Would you like to book an appointment?"), line("caller", "Yes please.")],
      path: [{ node: "greeting" }, { node: "collect_details", via: "choose_intent", args: {} }],
    },
  ];
  await page.route("**/api/agents/*/runs", (route) => route.fulfill({ json: runs }));

  await page.route("**/api/copilot/*", async (route) => {
    const body = route.request().postDataJSON() as { agent: { nodes: Array<Record<string, unknown>> } };
    const agent = structuredClone(body.agent);
    const first = agent.nodes[0] as { edges?: Array<Record<string, unknown>> };
    agent.nodes.push({ name: "cancel_appointment", task_messages: [{ role: "developer", content: "Take the cancellation." }], post_actions: [{ type: "end_conversation" }] });
    first.edges = [...(first.edges ?? []), { function: "cancel", description: "The caller wants to cancel.", target: "cancel_appointment" }];
    const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        sse("findings", { findings: [{ title: "No way to cancel", runs: ["r-9002"], cause: "The greeting only offers booking.", fix: "Add a cancel path.", node: "greeting" }] }),
        sse("draft", { agent }),
        sse("text", { delta: "Added a cancel path." }),
        sse("proposal", { agent, issues: [] }),
        sse("done", {}),
      ].join(""),
    });
  });

  const replayBodies: Array<{ proposal?: unknown; run_ids: string[] }> = [];
  await page.route("**/api/agents/*/replay", async (route) => {
    const body = route.request().postDataJSON() as { proposal?: unknown; run_ids: string[] };
    replayBodies.push(body);
    const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const result = (run_id: string, version: string, outcome: string, goal_met: boolean, reason: string, path: unknown[]) =>
      sse("result", { run_id, version, outcome, goal_met, reason, path, transcript: [line("agent", "Hello, how can I help?"), line("caller", run_id === "r-9002" ? "I need to cancel." : "Book me in."), line("agent", version === "after" ? "I will take that for you." : "Sorry, I can only book.")] });
    const events = body.proposal
      ? [
          result("r-9002", "before", "abandoned", false, "The agent could only offer booking.", [{ node: "greeting" }]),
          result("r-9002", "after", "completed", true, "The caller cancelled through the new node.", [{ node: "greeting" }, { node: "cancel_appointment", via: "cancel", args: {} }]),
          result("r-9003", "before", "completed", true, "Booked.", [{ node: "greeting" }, { node: "collect_details", via: "choose_intent", args: {} }]),
          result("r-9003", "after", "completed", true, "Booked.", [{ node: "greeting" }, { node: "collect_details", via: "choose_intent", args: {} }]),
        ]
      : [result("r-9002", "before", "stuck", false, "The agent could only offer booking.", [{ node: "greeting" }])];
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: [...events, sse("done", {})].join("") });
  });

  await page.goto("/");
  await page.getByRole("link", { name: /Prosper Scheduler/ }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByRole("tab", { name: "Runs" }).click();
  await page.getByRole("button", { name: "Analyze runs" }).click();

  const card = page.getByRole("region", { name: "Replay" });
  await expect(card).toContainText("cost money");
  await card.getByRole("button", { name: /^Replay \d+ calls?$/ }).click();
  await expect(card).toContainText("Fixed 1 of 1 failing call · 1 of 1 working call still works");
  await expect(card).toContainText("Simulated text calls");
  expect(replayBodies[0].run_ids).toEqual(["r-9002", "r-9003"]);
  await expect(card.getByRole("listitem").first()).toContainText("Fixed");

  // opening a row draws its path on the proposal: the new node ends the path
  await card.getByRole("button", { name: /r-9002/ }).click();
  await expect(card.getByRole("list", { name: "Transcript of r-9002 after" })).toContainText("I will take that for you.");
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(page.locator('.react-flow__node [data-run="end"]')).toContainText("cancel_appointment");
  await expect(page.locator('.react-flow__node [data-run="visited"]')).toContainText("greeting");
  await expect(page.locator(".react-flow__edge .edge--run")).toHaveCount(1);
  await page.screenshot({ path: "test-results/replay-card.png" });
  await card.getByRole("button", { name: /r-9002/ }).click();
  await expect(page.locator('.react-flow__node [data-run="end"]')).toHaveCount(0);

  // a copilot draft owns the canvas: Replay this call says why it is off
  await page.locator(".runs__row", { hasText: "abandoned" }).click();
  await expect(page.getByRole("button", { name: "Replay this call" })).toBeDisabled();
  await expect(page.getByText("Apply or discard the copilot's draft first.")).toBeVisible();
  await page.screenshot({ path: "test-results/replay-this-call-disabled.png" });

  await page.getByRole("region", { name: "Proposal" }).getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("button", { name: "Replay this call" })).toBeEnabled();
  await page.getByRole("button", { name: "Replay this call" }).click();
  const section = page.getByRole("region", { name: "Replay this call" });
  await expect(section).toContainText("Goal not met");
  await expect(section).toContainText("The agent could only offer booking.");
  expect(replayBodies[1].proposal).toBeUndefined();
  await expect(page.locator('.react-flow__node [data-run="end"]')).toContainText("greeting");
  await page.screenshot({ path: "test-results/replay-this-call.png" });
  expect(errors).toEqual([]);
});

// New from guidelines: the real sample guidelines come from the API, the copilot turn is stubbed with a skeleton
// draft, a coverage event and a proposal. The coverage card shows the count, the questions and the sample reply.
test("guidelines: create from the sample, see the coverage card and its questions", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !isNoGuidelines(m) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  const messages: string[] = [];
  await page.route("**/api/copilot/*", async (route) => {
    const body = route.request().postDataJSON() as { message: string; agent: { nodes: Array<Record<string, unknown>> } };
    messages.push(body.message);
    const agent = structuredClone(body.agent) as typeof body.agent & { initial_node: string };
    const first = agent.nodes[0] as { edges?: Array<Record<string, unknown>> };
    agent.nodes.push({
      name: "cancel_appointment",
      task_messages: [{ role: "developer", content: "Take the cancellation and hand off to staff." }],
      post_actions: [{ type: "end_conversation" }],
    });
    first.edges = [...(first.edges ?? []), { function: "cancel", description: "The caller wants to cancel.", target: "cancel_appointment" }];
    const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        sse("step", { label: "Reading guidelines" }),
        sse("draft", { agent }),
        sse("step", { label: "Reporting coverage (2/3)" }),
        sse("coverage", {
          requirements: [
            { id: "r1", text: "Greet the caller", quote: "Answer warmly.", status: "covered", nodes: ["greeting"] },
            { id: "r2", text: "Cancel an appointment", quote: "Callers may cancel.", status: "default", nodes: ["cancel_appointment"], note: "No notice window stated" },
            { id: "r3", text: "After-hours nurse line", quote: "Call the nurse line.", status: "open", nodes: [] },
          ],
          questions: [
            { id: "q1", question: "How much notice is required to cancel?", default: "Hand off to staff", requirements: ["r2"] },
            { id: "q2", question: "What is the nurse line number?", default: "Say staff will call back", requirements: ["r3"] },
          ],
        }),
        sse("text", { delta: "Built a first version." }),
        sse("proposal", { agent, issues: [] }),
        sse("done", {}),
      ].join(""),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "New from guidelines" }).click();
  const samples = page.getByRole("button", { name: /^Use sample:/ });
  await expect(samples).toHaveText(["Use sample: Harbor Dental Reschedule", "Use sample: Maple Family Practice"]);
  await samples.first().click();
  await expect(page.getByRole("dialog").getByLabel("Name", { exact: true })).toHaveValue("Harbor Dental Reschedule");
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Guidelines" })).toHaveValue(/reschedule line/);
  await page.getByRole("button", { name: /^create/i }).click();
  await expect(page).toHaveURL(/\/agents\//);

  const card = page.getByRole("region", { name: "Coverage" });
  await expect(card).toContainText("Covers 2 of 3 requirements · 2 questions for the client");
  await expect(card.getByText("How much notice is required to cancel?")).toBeVisible();
  expect(messages[0]).toBe("Build this agent from the client's guidelines.");

  await card.getByRole("button", { name: "Copy as email" }).click();
  await expect(page.getByText(/Questions copied/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("1. How much notice is required to cancel?");

  await card.getByRole("button", { name: "cancel_appointment" }).click();
  await expect(page.locator(".react-flow__node", { hasText: "cancel_appointment" })).toBeVisible();

  await card.getByRole("button", { name: "Use sample client reply" }).click();
  await expect(page.getByRole("textbox", { name: "Message to the copilot" })).toHaveValue(/555-0142/);
  expect(messages).toHaveLength(1);

  await card.getByRole("button", { name: "Re-check coverage" }).click();
  await expect.poll(() => messages.length).toBe(2);
  expect(messages[1]).toContain("report coverage");
  await page.screenshot({ path: "test-results/coverage-card.png" });
  expect(errors).toEqual([]);
});
