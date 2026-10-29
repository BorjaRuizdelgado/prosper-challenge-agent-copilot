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
