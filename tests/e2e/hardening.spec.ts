import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S8 hardening: the shared demo across two browsers (EM-62), where the demo opens (EM-58), a
 * keyboard-only run of the whole core loop (UX-11), and axe on the screens no other spec reaches.
 */
const FIXTURE = readFileSync("tests/fixtures/ai/plan/valid.json", "utf8");
const STEP = { timeout: 15_000 };

test.use({ locale: "en-IN" });

/** The plan call answered from the recorded fixture in the browser, as in the dashboard spec. */
async function servePlanFixture(page: Page): Promise<void> {
  await page.route("**/api/ai/plan", (route) =>
    route.fulfill({ contentType: "application/json", body: `{"ok":true,"data":${FIXTURE},"meta":{"attempts":1,"model":"fixture"}}` }),
  );
}

async function plannedEvent(page: Page): Promise<string> {
  await servePlanFixture(page);
  await page.goto("/events/new");
  await page.getByRole("button", { name: "Jaipur wedding, ₹8 lakh" }).click(STEP);
  await page.getByRole("button", { name: "Continue to questions" }).click();
  await page.getByRole("button", { name: "Create event" }).click();
  await page.getByRole("button", { name: "Generate my plan" }).click(STEP);
  await expect(page.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(STEP);
  return page.url();
}

async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

const lineRow = (page: Page, name: string): Locator => page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 4, name }) });

async function openLineSheet(page: Page, name: string, amount: string): Promise<Locator> {
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  const sheet = page.getByRole("dialog", { name: `Edit ${name}` });
  await sheet.getByLabel("Amount", { exact: true }).fill(amount);
  return sheet;
}

test.describe("the shared demo in two browsers (EM-62)", () => {
  test("edits appear live in the other browser, and a save on an out-of-date copy is refused and reloaded", async ({ page, browser }) => {
    test.slow();
    const url = await plannedEvent(page);
    const other = await browser.newContext({ locale: "en-IN" });
    try {
      const second = await other.newPage();
      await second.goto(url);
      await expect(second.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(STEP);

      // A change in one browser shows up in the other without a reload.
      const sheet = await openLineSheet(page, "Invitations", "25000");
      await sheet.getByRole("button", { name: "Save" }).click();
      await expect(lineRow(second, "Invitations").getByText("₹25,000", { exact: true })).toBeVisible(STEP);

      // The second browser stops receiving live updates (its listen channel is cut; saves still go
      // through), misses the next change, then saves on its old copy: refused and reloaded, not lost.
      const theirs = await openLineSheet(second, "Decoration and flowers", "90k");
      const LISTEN = "**/google.firestore.v1.Firestore/Listen/**";
      await other.setOffline(true);
      await second.route(LISTEN, (route) => route.abort());
      await other.setOffline(false);
      const mine = await openLineSheet(page, "Decoration and flowers", "70k");
      await mine.getByRole("button", { name: "Save" }).click();
      await expect(lineRow(page, "Decoration and flowers").getByText("₹70,000", { exact: true })).toBeVisible();
      await expect(page.getByText("Saved", { exact: true })).toBeVisible(STEP);
      await theirs.getByRole("button", { name: "Save" }).click();
      await second.unroute(LISTEN);
      const refused = second;
      await expect(refused.getByText("Someone else changed this event", { exact: true })).toBeVisible(STEP);
      await expect(refused.getByText(/Your change wasn't saved: .*Decoration and flowers.*Please make it again\./)).toBeVisible();
      // Nothing is lost silently: both browsers now show the change that was saved.
      for (const p of [page, second]) await expect(lineRow(p, "Decoration and flowers").getByText("₹70,000", { exact: true })).toBeVisible(STEP);
      await expect(page.getByText("Someone else changed this event", { exact: true })).toBeHidden();
      await expectNoSeriousA11yViolations(refused);
    } finally {
      await other.close();
    }
  });
});

test.describe("where the demo opens (EM-58)", () => {
  test("a new tab reopens the demo event this browser last worked on; All events then lists every event", async ({ page, context }) => {
    test.slow();
    await page.goto("/events/new");
    await page.getByRole("button", { name: "Jaipur wedding, ₹8 lakh" }).click(STEP);
    await page.getByRole("button", { name: "Continue to questions" }).click();
    await page.getByRole("button", { name: "Create event" }).click();
    await expect(page.getByRole("button", { name: "Generate my plan" })).toBeVisible(STEP);
    const eventPath = new URL(page.url()).pathname;

    const tab = await context.newPage();
    await tab.goto("/");
    await expect(tab).toHaveURL(new RegExp(`${eventPath}$`), STEP);
    await expect(tab.getByRole("button", { name: "Generate my plan" })).toBeVisible(STEP);

    await tab.getByRole("link", { name: "All events" }).click();
    await expect(tab.getByRole("heading", { level: 1, name: "Your events" })).toBeVisible(STEP);
    await expect(tab).toHaveURL(/\/$/);
    await expect(tab.getByText(/\(last reset: |It resets every night at 3:00 AM IST\./).first()).toBeVisible();
  });
});

test.describe("keyboard only (UX-11)", () => {
  // Desktop only: the 360 px layout of each screen is covered by the other specs.
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "Desktop only");
  });

  /** Moves focus to the control the way Tab would, then uses only keys. */
  async function press(target: Locator, key = "Enter"): Promise<void> {
    await target.focus();
    await expect(target).toBeFocused();
    await target.page().keyboard.press(key);
  }

  async function type(target: Locator, text: string): Promise<void> {
    await target.focus();
    await target.page().keyboard.press("ControlOrMeta+a");
    await target.page().keyboard.type(text);
  }

  test("create → plan → change → before/after → Apply → quotes, with visible focus", async ({ page }) => {
    test.slow();
    await servePlanFixture(page);
    await page.goto("/events/new");

    // Focus is visible: the first Tab lands on the skip link, drawn with a focus ring.
    await page.keyboard.press("Tab");
    const focusRing = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return { visible: el.matches(":focus-visible"), ring: style.outlineStyle !== "none" || style.boxShadow !== "none" };
    });
    expect(focusRing).toEqual({ visible: true, ring: true });

    await press(page.getByRole("button", { name: "Jaipur wedding, ₹8 lakh" }));
    await press(page.getByRole("button", { name: "Continue to questions" }));
    await press(page.getByRole("button", { name: "Create event" }));
    await press(page.getByRole("button", { name: "Generate my plan" }));
    await expect(page.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(STEP);

    await press(page.getByRole("button", { name: "Change budget, date or guests" }));
    const change = page.getByRole("dialog", { name: "Change budget, date or guests" });
    await type(change.getByLabel("Total budget"), "6 lakh");
    await expect(change.getByText("Understood as ₹6,00,000")).toBeVisible();
    await press(change.getByRole("button", { name: "See the effect" }));
    await expect(page.getByRole("heading", { level: 1, name: "Proposed revision" })).toBeVisible(STEP);

    const option = page.getByRole("radiogroup", { name: /over the new budget/ }).getByRole("radio", { name: /Drop the live band and the favours/ });
    await press(option, "Space");
    await expect(option).toBeChecked();
    await press(page.getByRole("button", { name: "Apply changes" }));
    await expect(page.getByText("allocated of ₹6,00,000 budget")).toBeVisible(STEP);
    await expect(page.getByRole("heading", { level: 4, name: "Live band" })).toHaveCount(0);

    await press(page.getByRole("link", { name: "Compare quotes for Catering" }));
    await expect(page.getByRole("heading", { level: 1, name: "Compare quotes for Catering" })).toBeVisible(STEP);
    await press(page.getByRole("button", { name: "Add a quote" }).first());
    const add = page.getByRole("dialog", { name: "Add a quote for Catering" });
    await press(add.getByRole("button", { name: "Unclear tax" }));
    await press(add.getByRole("button", { name: "Read the quote" }));
    await expect(add).toBeHidden();
    await expect(page.getByRole("article", { name: "Marwar Kitchen Co." }).getByText("Tax unclear")).toBeVisible(STEP);

    await press(page.getByRole("radio", { name: "Select Marwar Kitchen Co." }), "Space");
    await press(page.getByRole("region", { name: "Selected quote" }).getByRole("button", { name: "Link to line" }));
    await expect(page.getByText("Catering is now Vendor Quoted (Unverified), using the quote from Marwar Kitchen Co.")).toBeVisible();
  });
});

test.describe("accessibility of the remaining screens (UX-11)", () => {
  test("event not found, and the quotes line picker", async ({ page }) => {
    await page.goto("/events/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Event not found")).toBeVisible(STEP);
    await expectNoSeriousA11yViolations(page);

    const url = await plannedEvent(page);
    await page.goto(`${url}/quotes`);
    await expect(page.getByRole("heading", { level: 1, name: "Compare quotes" })).toBeVisible(STEP);
    await expectNoSeriousA11yViolations(page);
  });
});
