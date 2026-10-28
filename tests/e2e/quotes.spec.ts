import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Vendor quote comparison (S7): paste the three sample quotes (UX-10), see the hidden-charge gap,
 * unclear tax and currency flags (EM-49 to EM-51), compare, link and confirm one (EM-41), and the
 * manual-entry fallback when the AI is down (spec §7.6). Quote reading uses the server's fixture
 * provider, which picks the fixture recorded for each sample.
 */
const FIXTURE = readFileSync("tests/fixtures/ai/plan/valid.json", "utf8");
const FIRST_LOAD = { timeout: 15_000 };

test.use({ locale: "en-IN" });

async function cateringQuotes(page: Page): Promise<void> {
  await page.route("**/api/ai/plan", (route) =>
    route.fulfill({ contentType: "application/json", body: `{"ok":true,"data":${FIXTURE},"meta":{"attempts":1,"model":"fixture"}}` }),
  );
  await page.goto("/events/new");
  await page.getByRole("button", { name: "Jaipur wedding, ₹8 lakh" }).click(FIRST_LOAD);
  await page.getByRole("button", { name: "Continue to questions" }).click();
  await page.getByRole("button", { name: "Create event" }).click();
  await page.getByRole("button", { name: "Generate my plan" }).click(FIRST_LOAD);
  await page.getByRole("link", { name: "Compare quotes for Catering" }).click(FIRST_LOAD);
  await expect(page.getByRole("heading", { level: 1, name: "Compare quotes for Catering" })).toBeVisible(FIRST_LOAD);
}

async function addSample(page: Page, sample: string): Promise<void> {
  await page.getByRole("button", { name: "Add a quote" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add a quote for Catering" });
  await sheet.getByRole("button", { name: sample }).click();
  await sheet.getByRole("button", { name: "Read the quote" }).click();
  await expect(sheet).toBeHidden();
}

async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

const card = (page: Page, vendor: string) => page.getByRole("article", { name: vendor });

test("three sample quotes: gap, unclear tax and currency flags, then link and confirm one", async ({ page }) => {
  test.slow();
  await cateringQuotes(page);
  await expect(page.getByText("No quotes for this line yet")).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // EM-49: the items fall ₹10,000 short of the stated total.
  await addSample(page, "Hidden charge");
  const saffron = card(page, "Saffron Table Caterers");
  await expect(saffron.getByText("Gap of ₹10,000: possible hidden or missing charge")).toBeVisible(FIRST_LOAD);
  await expect(saffron.getByText("From your quote: unverified")).toBeVisible();
  await expect(saffron.getByText("Unverified until you confirm with the vendor")).toBeVisible();

  // EM-51 and EM-33: tax unclear, 10 guests short.
  await addSample(page, "Unclear tax");
  const marwar = card(page, "Marwar Kitchen Co.");
  await expect(marwar.getByText("Tax unclear")).toBeVisible(FIRST_LOAD);
  await expect(marwar.getByText("Covers 140 of 150 guests")).toBeVisible();
  await expect(marwar.getByText("Adds up")).toBeVisible();

  // EM-50: another currency is left out until the user enters a converted total; never converted.
  await addSample(page, "Different currency");
  const silver = card(page, "Silver Spoon Global Catering");
  await expect(silver.getByText("Quoted in USD")).toBeVisible(FIRST_LOAD);
  const matrix = page.getByRole("table", { name: /Quotes compared/ });
  await expect(matrix.getByText("Not compared: enter the total in INR")).toBeVisible();
  await silver.getByLabel("Total in INR").fill("2.1 lakh");
  await expect(silver.getByText("Understood as ₹2,10,000")).toBeVisible();
  await silver.getByRole("button", { name: "Save total" }).click();
  await expect(matrix.getByText("Not compared: enter the total in INR")).toBeHidden();

  // EM-33: missing values read "Not stated", never 0; EM-30: questions built from the checks.
  await expect(matrix.getByRole("rowheader", { name: "Taxes and fees" })).toBeVisible();
  await expect(matrix.getByText("Not stated").first()).toBeVisible();
  const questions = page.getByRole("region", { name: "Questions to ask" });
  await expect(questions.getByText("Do prices include tax?")).toBeVisible();
  await expect(questions.getByText("The line items add up to ₹10,000 less than your total. What is the difference for?")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  if (test.info().project.name === "mobile") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  // EM-41: the user links, then confirms. Nothing is booked or sent (EM-36).
  await page.getByRole("radio", { name: "Select Marwar Kitchen Co." }).check();
  const dock = page.getByRole("region", { name: "Selected quote" });
  await expect(dock.getByText("₹1,77,000 total")).toBeVisible();
  await dock.getByRole("button", { name: "Link to line" }).click();
  await expect(page.getByText("Catering is now Vendor Quoted (Unverified), using the quote from Marwar Kitchen Co.")).toBeVisible();
  await expect(page.getByText("Line budget ₹1,77,000")).toBeVisible();
  await expect(marwar.getByText("Vendor Quoted (Unverified)")).toBeVisible();
  await dock.getByRole("button", { name: "Confirm this price" }).click();
  await expect(page.getByText("Catering is now Confirmed.")).toBeVisible();
  await expect(dock.getByText("This line is confirmed. Un-confirm it on the plan to use another quote.")).toBeVisible();

  await page.getByRole("link", { name: "Back to the plan" }).click();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 4, name: "Catering" }) });
  await expect(row.getByText("Confirmed")).toBeVisible(FIRST_LOAD);
  await expect(row.getByText("₹1,77,000", { exact: true })).toBeVisible();
});

test("AI down: the quote's text is kept and its details can be entered by hand (spec §7.6)", async ({ page }) => {
  await cateringQuotes(page);
  await page.route("**/api/ai/quote", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "AI_UNAVAILABLE", message: "The AI service is unavailable right now. Please try again.", retryable: true } }),
    }),
  );
  await addSample(page, "Unclear tax");
  const quote = card(page, "Quote 1");
  await expect(quote.getByText("The quote couldn't be read")).toBeVisible(FIRST_LOAD);
  await expect(quote.getByRole("button", { name: "Retry" })).toBeVisible();

  await quote.getByRole("button", { name: "Enter details manually" }).click();
  const sheet = page.getByRole("dialog", { name: "Enter the quote's details" });
  await sheet.getByLabel("Vendor name").fill("Marwar Kitchen");
  await sheet.getByLabel("Price before tax and fees").fill("1,77,000");
  await sheet.getByLabel("Guests the price covers").fill("140");
  await sheet.getByRole("button", { name: "Save details" }).click();
  await expect(sheet).toBeHidden();

  // The same checks run on hand-entered details (EM-49 to EM-51).
  const manual = card(page, "Marwar Kitchen");
  await expect(manual.getByText("Quote states no total")).toBeVisible();
  await expect(manual.getByText("Tax unclear")).toBeVisible();
  await expect(manual.getByText("Entered by you")).toBeVisible();
  await expect(page.getByRole("region", { name: "Questions to ask" }).getByText("What is the total price, including all taxes and fees?")).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await manual.getByRole("button", { name: "Delete Marwar Kitchen" }).click();
  await manual.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No quotes for this line yet")).toBeVisible();
});
