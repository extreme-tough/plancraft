import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * S9 Figma extras: the notifications bell (EM-65), payments (EM-64), team notes (EM-66), the
 * moodboard as the demo account sees it (EM-67) and the quote fit score (EM-68).
 */
const FIXTURE = readFileSync("tests/fixtures/ai/plan/valid.json", "utf8");
const STEP = { timeout: 15_000 };

test.use({ locale: "en-IN" });

async function plannedEvent(page: Page): Promise<void> {
  await page.route("**/api/ai/plan", (route) =>
    route.fulfill({ contentType: "application/json", body: `{"ok":true,"data":${FIXTURE},"meta":{"attempts":1,"model":"fixture"}}` }),
  );
  await page.goto("/events/new");
  await page.getByRole("button", { name: "Jaipur wedding, ₹8 lakh" }).click(STEP);
  await page.getByRole("button", { name: "Continue to questions" }).click();
  await page.getByRole("button", { name: "Create event" }).click();
  await page.getByRole("button", { name: "Generate my plan" }).click(STEP);
  await expect(page.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(STEP);
}

async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

/** The browser's local date plus `days`, as YYYY-MM-DD (EM-55). */
async function localDate(page: Page, days: number): Promise<string> {
  return page.evaluate((d) => {
    const date = new Date();
    date.setDate(date.getDate() + d);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }, days);
}

test("a payment due soon shows in the notifications bell, and dismissing it sticks (EM-64, EM-65)", async ({ page }) => {
  test.slow();
  await plannedEvent(page);
  const bell = page.getByRole("button", { name: /^Notifications: / });
  const before = Number((await bell.getAttribute("aria-label"))?.match(/\d+/)?.[0] ?? 0);

  await page.getByRole("button", { name: "Edit Invitations" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit Invitations" });
  await sheet.getByLabel("Amount paid so far").fill("5000");
  await sheet.getByLabel("Balance due by").fill(await localDate(page, 3));
  await sheet.getByLabel("Payment note").fill("Advance paid by UPI");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  const row = page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 4, name: "Invitations" }) });
  await expect(row.getByText(/^Paid ₹5,000 of ₹[\d,]+ · balance due /)).toBeVisible(STEP);
  await expect(row.getByText("Advance paid by UPI")).toBeVisible();

  await expect(bell).toHaveAttribute("aria-label", `Notifications: ${before + 1}`);
  await bell.click();
  await expect(bell).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("region", { name: "Notifications" });
  const alert = panel.getByText(/^Payment due in 3 days: ₹[\d,]+ for Invitations, by /);
  await expect(alert).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await panel.getByRole("button", { name: /^Dismiss: Payment due in 3 days/ }).click();
  await expect(alert).toBeHidden();
  await expect(bell).toHaveAttribute("aria-label", `Notifications: ${before}`);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();

  // The dismissal is saved with the plan, so it survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(STEP);
  await page.getByRole("button", { name: /^Notifications: / }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText(/Payment due in 3 days/)).toHaveCount(0);
});

test("team notes save and survive a reload; the demo account can view but not upload to the moodboard (EM-66, EM-67)", async ({ page }) => {
  test.slow();
  await plannedEvent(page);
  const notes = page.getByRole("textbox", { name: "Team notes" });
  await notes.fill("Priya calls the decorator on Monday.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes saved")).toBeVisible(STEP);

  const moodboard = page.getByRole("region", { name: "Moodboard" });
  await expect(moodboard.getByText("0 of 6 images")).toBeVisible();
  await expect(moodboard.getByText("No images yet.", { exact: false })).toBeVisible(STEP);
  await expect(moodboard.getByText(/Sign in with Google to add your own images/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Team notes" })).toHaveValue("Priya calls the decorator on Monday.", STEP);
});

test("quotes show a fit score with its parts, and a team note per quote (EM-66, EM-68)", async ({ page }) => {
  test.slow();
  await plannedEvent(page);
  await page.getByRole("link", { name: "Compare quotes for Catering" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Compare quotes for Catering" })).toBeVisible(STEP);
  for (const sample of ["Hidden charge", "Unclear tax"]) {
    await page.getByRole("button", { name: "Add a quote" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Add a quote for Catering" });
    await sheet.getByRole("button", { name: sample }).click();
    await sheet.getByRole("button", { name: "Read the quote" }).click();
    await expect(sheet).toBeHidden();
  }
  const saffron = page.getByRole("article", { name: "Saffron Table Caterers" });
  const marwar = page.getByRole("article", { name: "Marwar Kitchen Co." });
  await expect(saffron.getByText(/^Fit score: \d+ of 100$/)).toBeVisible(STEP);
  await expect(marwar.getByText(/^Fit score: \d+ of 100$/)).toBeVisible(STEP);

  await saffron.getByText("How the score is worked out").click();
  await expect(saffron.getByText(/^Clear pricing: 12 of 20: the total has a gap/)).toBeVisible();
  await expect(saffron.getByText(/^Budget fit: \d+ of 50$/)).toBeVisible();
  await expect(page.getByText("Best fit by our checks", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("table", { name: /Quotes compared/ }).getByRole("rowheader", { name: "Fit score" })).toBeVisible();

  const note = marwar.getByLabel("Team note");
  await note.fill("Ask about the 10 missing plates.");
  await note.blur();
  await expect(marwar.getByText("Note saved")).toBeVisible(STEP);
  await expectNoSeriousA11yViolations(page);
  await page.reload();
  await expect(page.getByRole("article", { name: "Marwar Kitchen Co." }).getByLabel("Team note")).toHaveValue("Ask about the 10 missing plates.", STEP);
});
