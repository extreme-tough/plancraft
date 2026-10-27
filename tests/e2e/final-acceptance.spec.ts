import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The final acceptance test (spec §12), with the fixture provider behind the real server routes.
 *
 * Setup: Jaipur example (150 guests, event in 120 days), the fixture plan, the venue confirmed at
 * 2,50,000. Then: budget to 6,00,000 and the date 14 days earlier. Expected figures, in minor units,
 * follow from the fixture weights: other flat lines 35 % of the budget, catering floor(35 % ÷ 150) × 150.
 */

const STEP = { timeout: 15_000 };

interface Combo {
  name: string;
  locale: string;
  currency: string;
  exponent: number;
  /** Plan style radio; null keeps the example's Wedding. */
  style: string | null;
  budget: string;
  venue: string;
  newBudget: string;
  minor: { budget: number; venue: number; newBudget: number };
}

const COMBOS: Combo[] = [
  { name: "wedding · INR · en-IN", locale: "en-IN", currency: "INR", exponent: 2, style: null, budget: "8 lakh", venue: "250000", newBudget: "6 lakh", minor: { budget: 80_000_000, venue: 25_000_000, newBudget: 60_000_000 } },
  { name: "small celebration · EUR · de-DE", locale: "de-DE", currency: "EUR", exponent: 2, style: "Small celebration", budget: "8.000", venue: "2500", newBudget: "6.000", minor: { budget: 800_000, venue: 250_000, newBudget: 600_000 } },
  { name: "community · JPY · ja-JP", locale: "ja-JP", currency: "JPY", exponent: 0, style: "Community event", budget: "800000", venue: "250000", newBudget: "600000", minor: { budget: 800_000, venue: 250_000, newBudget: 600_000 } },
];

/** What the fixture plan comes to once the venue is confirmed (Σ line amounts). */
function figures(combo: Combo) {
  const { budget, venue, newBudget } = combo.minor;
  const otherFlat = (budget * 35) / 100;
  const catering = Math.floor((budget * 35) / 100 / 150) * 150;
  const total = otherFlat + venue + catering;
  const optionOneSaves = (budget * 8) / 100; // the live band (6 %) and favours (2 %)
  return { total, shortfall: total - newBudget, optionOneSaves, afterOptionOne: total - optionOneSaves };
}

function money(combo: Combo, minor: number): string {
  return new Intl.NumberFormat(combo.locale, { style: "currency", currency: combo.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
    Math.round(minor / 10 ** combo.exponent),
  );
}

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function longDate(locale: string, iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)));
}

async function noSeriousA11y(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

/** Creates the event, generates the fixture plan, confirms the venue, and reloads (§12 setup, variant a). */
async function setUp(page: Page, combo: Combo): Promise<string> {
  await page.goto("/events/new");
  await page.getByRole("button", { name: "Jaipur wedding, ₹8 lakh" }).click(STEP);
  if (combo.style) await page.getByRole("radiogroup", { name: "Plan style" }).getByRole("radio", { name: combo.style }).click();
  if (combo.currency !== "INR") {
    const currency = page.getByRole("combobox", { name: "Currency" });
    await currency.fill(combo.currency);
    await currency.press("Enter");
    await expect(currency).toHaveValue(combo.currency);
  }
  await page.getByLabel("Total budget").fill(combo.budget);
  await page.getByRole("button", { name: "Continue to questions" }).click();
  await page.getByRole("button", { name: "Create event" }).click();
  await page.getByRole("button", { name: "Generate my plan" }).click(STEP);
  await expect(page.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(STEP);

  await page.getByRole("button", { name: "Edit Venue hire" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit Venue hire" });
  await sheet.getByLabel("Amount", { exact: true }).fill(combo.venue);
  await sheet.getByRole("switch", { name: "Confirmed" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  // Assertion 1 (variant a): after returning, the stored event is as it was.
  await page.reload();
  await expect(page.getByText(`Confirmed: ${money(combo, combo.minor.venue)}`)).toBeVisible(STEP);
  return page.url();
}

async function startChange(page: Page, combo: Combo): Promise<string> {
  const newDate = isoInDays(120 - 14);
  await page.getByRole("button", { name: "Change budget, date or guests" }).click();
  const sheet = page.getByRole("dialog", { name: "Change budget, date or guests" });
  await sheet.getByLabel("Total budget").fill(combo.newBudget);
  await sheet.getByLabel("Event date").fill(newDate);
  await sheet.getByRole("button", { name: "See the effect" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Proposed revision" })).toBeVisible(STEP);
  return newDate;
}

test.describe("final acceptance test (spec §12)", () => {
  // Desktop only: the 360 px layout is covered by the other specs, and each run makes real AI calls.
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "Desktop only");
  });

  for (const combo of COMBOS) {
    test.describe(combo.name, () => {
      // Assertion 8: each combination runs in its own browser locale.
      test.use({ locale: combo.locale });

      test(`revise instead of starting again: ${combo.name}`, async ({ page, context }) => {
        test.slow();
        const f = figures(combo);
        const dashboardUrl = await setUp(page, combo);
        await startChange(page, combo);

        // 3: budget old → new, the shortfall calculated by code, deadlines 14 days earlier, venue flagged.
        await expect(page.getByText(`Budget: ${money(combo, combo.minor.budget)} → ${money(combo, combo.minor.newBudget)}`)).toBeVisible();
        await expect(page.getByText(`Shortfall: ${money(combo, f.shortfall)}`)).toBeVisible();
        const timeline = page.getByRole("region", { name: "Timeline" });
        await expect(timeline.getByRole("listitem")).toHaveCount(7); // every task is not done, so every deadline moved
        const venueTask = timeline.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Book venue" }) });
        await expect(venueTask).toContainText(longDate(combo.locale, isoInDays(120 - 90)));
        await expect(venueTask).toContainText(longDate(combo.locale, isoInDays(120 - 90 - 14)));
        const venueLine = page.getByRole("region", { name: "Budget lines" }).getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Venue hire" }) });
        await expect(venueLine.getByText("Reconfirm for new date")).toBeVisible();
        await expect(venueLine.getByText("Confirmed: protected")).toBeVisible();

        // 6: at least two options, none selected.
        const options = page.getByRole("radiogroup", { name: /over the new budget/ });
        await expect(options.getByRole("radio")).toHaveCount(2, STEP);
        for (const radio of await options.getByRole("radio").all()) await expect(radio).not.toBeChecked();
        await expect(options.getByText(`Saves ${money(combo, f.optionOneSaves)} · ${money(combo, f.afterOptionOne - combo.minor.newBudget)} still short`)).toBeVisible();
        await noSeriousA11y(page);

        // 2 and 6: selecting an option changes the preview only; the stored plan is untouched until Apply.
        await options.getByRole("radio", { name: /Drop the live band and the favours/ }).click();
        const other = await context.newPage();
        await other.goto(dashboardUrl);
        await expect(other.getByText(`allocated of ${money(combo, combo.minor.budget)} budget`)).toBeVisible(STEP);
        await expect(other.getByRole("heading", { level: 4, name: "Live band" })).toBeVisible();
        await other.close();

        await page.getByRole("button", { name: "Apply changes" }).click();
        await expect(page.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(STEP);

        // 4 and 5: the venue is still confirmed at its price, and allocated − shortfall = the new budget, exactly.
        await expect(page.getByText(`allocated of ${money(combo, combo.minor.newBudget)} budget`)).toBeVisible();
        await expect(page.getByText(`Confirmed: ${money(combo, combo.minor.venue)}`)).toBeVisible();
        await expect(page.getByText(money(combo, f.afterOptionOne), { exact: true })).toBeVisible();
        await expect(page.getByText(`Over budget by ${money(combo, f.afterOptionOne - combo.minor.newBudget)}`).first()).toBeVisible();
        await expect(page.getByRole("heading", { level: 4, name: "Live band" })).toHaveCount(0);
      });
    });
  }

  test.describe("en-IN", () => {
    test.use({ locale: "en-IN" });

    test("Discard leaves the plan exactly as it was (assertion 7)", async ({ page }) => {
      test.slow();
      const combo = COMBOS[0] as Combo;
      await setUp(page, combo);
      await startChange(page, combo);
      await expect(page.getByRole("radiogroup", { name: /over the new budget/ }).getByRole("radio")).toHaveCount(2, STEP);
      await page.getByRole("button", { name: "Discard revision" }).click();
      await page.getByRole("group", { name: "Confirm discard" }).getByRole("button", { name: "Discard" }).click();

      await expect(page.getByText(`allocated of ${money(combo, combo.minor.budget)} budget`)).toBeVisible(STEP);
      await expect(page.getByText(`Confirmed: ${money(combo, combo.minor.venue)}`)).toBeVisible();
      await expect(page.getByRole("heading", { level: 4 })).toHaveCount(10);
      await expect(page.getByRole("button", { name: "Review the pending revision" })).toHaveCount(0);
    });

    test("AI down: the code-built revision still shows and applies (assertion 9, AI-12)", async ({ page }) => {
      test.slow();
      const combo = COMBOS[0] as Combo;
      const f = figures(combo);
      await setUp(page, combo);
      await page.route("**/api/ai/revise", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "AI_UNAVAILABLE", message: "The AI service is unavailable right now. Please try again.", retryable: true } }) }),
      );
      await startChange(page, combo);

      await expect(page.getByText("The options couldn't be generated")).toBeVisible(STEP);
      await expect(page.getByRole("button", { name: "Retry" })).toBeEnabled();
      await expect(page.getByText(`Shortfall: ${money(combo, f.shortfall)}`)).toBeVisible();
      await noSeriousA11y(page);

      await page.getByRole("button", { name: "Apply changes" }).click();
      await expect(page.getByText(`allocated of ${money(combo, combo.minor.newBudget)} budget`)).toBeVisible(STEP);
      await expect(page.getByText(`Over budget by ${money(combo, f.shortfall)}`).first()).toBeVisible();
      await expect(page.getByText(`Confirmed: ${money(combo, combo.minor.venue)}`)).toBeVisible();
    });

    test("Ask for a change: options for a free-text request, then Apply one (EM-08, AI-03, AI-04)", async ({ page }) => {
      test.slow();
      await page.goto("/events/new");
      await page.getByRole("button", { name: "Jaipur wedding, ₹8 lakh" }).click(STEP);
      await page.getByRole("button", { name: "Continue to questions" }).click();
      await page.getByRole("button", { name: "Create event" }).click();
      await page.getByRole("button", { name: "Generate my plan" }).click(STEP);
      await expect(page.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(STEP);

      await page.getByRole("button", { name: "Ask for a change" }).click();
      const sheet = page.getByRole("dialog", { name: "Ask for a change" });
      await sheet.getByLabel("Your request").fill("We'd rather have a playlist than a live band.");
      await sheet.getByRole("button", { name: "Suggest options" }).click();
      await expect(page.getByText("Your request: “We'd rather have a playlist than a live band.”")).toBeVisible(STEP);

      // No shortfall here, so nothing is confirmed and all three fixture options are valid.
      const options = page.getByRole("radiogroup", { name: "Options for your request" });
      await expect(options.getByRole("radio")).toHaveCount(3, STEP);
      await options.getByRole("radio", { name: /Drop the live band and the favours/ }).click();
      await page.getByRole("button", { name: "Apply changes" }).click();
      await expect(page.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(STEP);
      await expect(page.getByRole("heading", { level: 4, name: "Live band" })).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 4 })).toHaveCount(8);
    });

    test("a stale proposal can't be applied until it is recalculated (EM-56)", async ({ page, context }) => {
      test.slow();
      const combo = COMBOS[0] as Combo;
      const dashboardUrl = await setUp(page, combo);
      await startChange(page, combo);
      await expect(page.getByRole("radiogroup", { name: /over the new budget/ }).getByRole("radio")).toHaveCount(2, STEP);

      // Someone else changes the plan meanwhile.
      const other = await context.newPage();
      await other.goto(dashboardUrl);
      await other.getByRole("button", { name: "Mark done: Book venue" }).click(STEP);
      await expect(other.getByText("Saved", { exact: true })).toBeVisible();
      await other.close();

      await expect(page.getByText("The plan changed since this proposal. Recalculate?")).toBeVisible(STEP);
      await expect(page.getByRole("button", { name: "Apply changes" })).toBeDisabled();
      await page.getByRole("button", { name: "Recalculate" }).click();
      await expect(page.getByRole("button", { name: "Apply changes" })).toBeEnabled(STEP);
    });
  });
});
