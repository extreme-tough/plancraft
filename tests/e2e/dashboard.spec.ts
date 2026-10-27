import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The Plan Dashboard (S5): edit a line, confirm, mark a task done → Next up updates; keyboard only;
 * axe; 360 px. The plan comes from the recorded fixture, served through the browser so these tests
 * don't use up the demo account's AI rate limit; the browser still validates and builds it.
 *
 * Fixture plan on ₹8,00,000 (weights out of 100): flat lines sum to ₹5,20,000, catering 35% →
 * ₹1,866.66 a plate × 150 = ₹2,79,999; allocated ₹7,99,999, remaining ₹1.
 */
const FIXTURE = readFileSync("tests/fixtures/ai/plan/valid.json", "utf8");
const FIRST_LOAD = { timeout: 15_000 };

test.use({ locale: "en-IN" });

async function plannedEvent(page: Page): Promise<void> {
  await page.route("**/api/ai/plan", (route) =>
    route.fulfill({ contentType: "application/json", body: `{"ok":true,"data":${FIXTURE},"meta":{"attempts":1,"model":"fixture"}}` }),
  );
  await page.goto("/events/new");
  await page.getByRole("button", { name: "Jaipur wedding, ₹8 lakh" }).click(FIRST_LOAD);
  await page.getByRole("button", { name: "Continue to questions" }).click();
  await page.getByRole("button", { name: "Create event" }).click();
  await page.getByRole("button", { name: "Generate my plan" }).click(FIRST_LOAD);
  await expect(page.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(FIRST_LOAD);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

function lineRow(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 4, name }) });
}

test("edit a line, confirm another, and mark a task done; all of it survives a reload", async ({ page }) => {
  test.slow();
  await plannedEvent(page);
  await expect(page.getByText("₹7,99,999", { exact: true })).toBeVisible();
  await expect(page.getByText("Remaining: ₹1")).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // EM-16: a new amount updates the totals at once, with no AI call; a shortfall shows as text and an icon (EM-44).
  await page.getByRole("button", { name: "Edit Decoration and flowers" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit Decoration and flowers" });
  await sheet.getByLabel("Amount", { exact: true }).fill("90k");
  await expect(sheet.getByText("Understood as ₹90,000")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(lineRow(page, "Decoration and flowers").getByText("₹90,000", { exact: true })).toBeVisible();
  await expect(page.getByText("Over budget by ₹9,999").first()).toBeVisible();

  // EM-20: only the user confirms.
  await page.getByRole("button", { name: "Edit Photography" }).click();
  const photo = page.getByRole("dialog", { name: "Edit Photography" });
  await photo.getByRole("switch", { name: "Confirmed" }).click();
  await photo.getByRole("button", { name: "Save" }).click();
  await expect(photo).toBeHidden();
  await expect(lineRow(page, "Photography").getByText("Confirmed")).toBeVisible();
  await expect(page.getByText("Confirmed: ₹64,000")).toBeVisible();

  // EM-24, EM-26: marking the first task done updates progress and Next up.
  const nextUp = page.getByRole("region", { name: "Next up" });
  await expect(nextUp.getByText("Book venue", { exact: true })).toBeVisible();
  await nextUp.getByRole("button", { name: "Mark done: Book venue" }).click();
  await expect(nextUp.getByText("14% of tasks done (1 of 7)")).toBeVisible();
  await expect(nextUp.getByText("Book caterer", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Mark Book venue not done" })).toBeChecked();

  await page.reload();
  await expect(lineRow(page, "Decoration and flowers").getByText("₹90,000", { exact: true })).toBeVisible(FIRST_LOAD);
  await expect(lineRow(page, "Photography").getByText("Confirmed")).toBeVisible();
  await expect(page.getByRole("region", { name: "Next up" }).getByText("14% of tasks done (1 of 7)")).toBeVisible();
});

test("a confirmed line can't be repriced or deleted until it is un-confirmed (EM-20, EM-42)", async ({ page }) => {
  await plannedEvent(page);
  await page.getByRole("button", { name: "Edit Venue hire" }).click();
  let sheet = page.getByRole("dialog", { name: "Edit Venue hire" });
  await sheet.getByRole("switch", { name: "Confirmed" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: "Edit Venue hire" }).click();
  sheet = page.getByRole("dialog", { name: "Edit Venue hire" });
  await expect(sheet.getByText("Un-confirm the line to change its price.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Delete" })).toBeDisabled();
});

test("the dependency picker greys out tasks that already wait for this one (EM-45)", async ({ page }) => {
  await plannedEvent(page);
  await page.getByRole("button", { name: "Edit Book venue" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit Book venue" });
  await expect(sheet.getByRole("checkbox", { name: /Menu tasting/ })).toBeDisabled();
  await expect(sheet.getByRole("checkbox", { name: /Book caterer/ })).toBeDisabled();
  await expect(sheet.getByRole("checkbox", { name: /Book photographer/ })).toBeEnabled();
});

test("add a line and a task, then delete the task", async ({ page }) => {
  await plannedEvent(page);
  await page.getByRole("button", { name: "Add a budget line" }).click();
  const lineSheet = page.getByRole("dialog", { name: "Add a budget line" });
  await lineSheet.getByLabel("Name").fill("Mehendi artist");
  await lineSheet.getByLabel("Amount", { exact: true }).fill("15k");
  await lineSheet.getByRole("button", { name: "Save" }).click();
  await expect(lineRow(page, "Mehendi artist")).toBeVisible();

  await page.getByRole("button", { name: "Add a task" }).click();
  const taskSheet = page.getByRole("dialog", { name: "Add a task" });
  await taskSheet.getByLabel("Title").fill("Order return gifts");
  await taskSheet.getByRole("checkbox", { name: /Finalise guest list/ }).check();
  await taskSheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("After: Finalise guest list").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Order return gifts" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Order return gifts" }).click();
  await page.getByRole("dialog", { name: "Edit Order return gifts" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Order return gifts" })).toHaveCount(0);
});

test("keyboard only: mark a task done and edit a line (UX-11)", async ({ page }) => {
  await plannedEvent(page);
  const markDone = page.getByRole("region", { name: "Next up" }).getByRole("button", { name: "Mark done: Book venue" });
  await markDone.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Next up" }).getByText("14% of tasks done (1 of 7)")).toBeVisible();

  await page.getByRole("button", { name: "Edit Invitations" }).focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Edit Invitations" });
  await expect(sheet).toBeVisible();
  const amount = sheet.getByLabel("Amount", { exact: true });
  await amount.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("25000");
  await page.keyboard.press("Enter"); // submits the form
  await expect(sheet).toBeHidden();
  await expect(lineRow(page, "Invitations").getByText("₹25,000", { exact: true })).toBeVisible();

  // Escape closes a sheet without saving.
  await page.getByRole("button", { name: "Edit Invitations" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Edit Invitations" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Edit Invitations" })).toBeHidden();
});

test("fits a 360 px screen and passes axe with the timeline and filters (UX-11, UX-12)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await plannedEvent(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByText("Confirmed", { exact: true }).first().click(); // the filter pill
  await expect(page.getByText("No lines with this label.")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
