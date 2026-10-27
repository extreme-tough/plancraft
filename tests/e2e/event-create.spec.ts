import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/** The first visit signs in to the shared demo and loads the Firebase SDK. */
const FIRST_LOAD = { timeout: 15_000 };

/** Local calendar date n days from today, as the browser on this machine sees it (EM-55). */
function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function openForm(page: Page): Promise<void> {
  await page.goto("/events/new");
  await expect(page.getByRole("heading", { name: "Step 1 of 2: Event basics" })).toBeVisible(FIRST_LOAD);
}

/** The texts of everything a control's aria-describedby points at. */
async function descriptions(control: Locator): Promise<string[]> {
  const ids = ((await control.getAttribute("aria-describedby")) ?? "").split(" ").filter(Boolean);
  return Promise.all(ids.map((id) => control.page().locator(`[id="${id}"]`).innerText()));
}

async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("event creation (EM-01, EM-02)", () => {
  test.use({ locale: "en-IN" });

  test("the wizard saves an event that is still there after a reload", async ({ page }) => {
    test.slow(); // Demo sign-in, two steps, a Firestore write and a reload.
    await openForm(page);

    await page.getByRole("radio", { name: /^Wedding Ceremony/ }).click();
    // EM-05: the occasion suggests a plan style, which stays editable.
    const planStyle = page.getByRole("radiogroup", { name: "Plan style" });
    await expect(planStyle.getByRole("radio", { name: "Wedding" })).toBeChecked();
    await page.getByLabel("Event name").fill("Meera & Arjun's wedding");
    await page.getByLabel("Event date").fill(isoInDays(90));
    await expect(page.getByText("90 days to plan")).toBeVisible();
    await page.getByLabel("City").fill("Udaipur");

    const country = page.getByRole("combobox", { name: "Country" });
    await country.fill("india");
    await country.press("Enter");
    await expect(country).toHaveValue("India");
    // The country suggests its currency; it can still be changed.
    await expect(page.getByRole("combobox", { name: "Currency" })).toHaveValue("INR");

    // EM-38: the amount is read back before it is used, with lakh grouping in en-IN (EM-37).
    const budget = page.getByLabel("Total budget");
    await budget.fill("15 lakh");
    const pill = page.getByText("Understood as ₹15,00,000");
    await expect(pill).toBeVisible();
    expect(await descriptions(budget)).toContain("Understood as ₹15,00,000");
    await expect(page.getByRole("button", { name: "₹15,00,000" })).toHaveAttribute("aria-pressed", "true");

    const guests = page.getByLabel("Expected guests", { exact: true });
    await guests.fill("199");
    await page.getByRole("button", { name: "More guests" }).click();
    await expect(guests).toHaveValue("200");
    await expect(page.getByText("About ₹7,500 per guest.")).toBeVisible();

    await page.getByRole("button", { name: "Add another part" }).click();
    await expect(page.getByLabel("Part 1 name")).toBeFocused();
    await page.getByLabel("Part 1 name").fill("Sangeet");
    await page.getByLabel("Part 1 guests").fill("120");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/events\/new\?step=2$/);
    await expect(page.getByRole("heading", { name: "Step 2 of 2: Questions" })).toBeFocused();

    // EM-02/EM-05: the wedding defaults are pre-picked; priorities are the only required answer.
    for (const name of ["Venue", "Catering", "Photography"]) {
      await expect(page.getByRole("checkbox", { name, exact: true })).toBeChecked();
    }
    await expect(page.getByRole("checkbox", { name: "Decoration", exact: true })).toBeDisabled();
    await page.getByLabel("Accessibility needs").fill("Ramp for a guest who uses a wheelchair");

    await page.getByRole("button", { name: "Create event" }).click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const heading = page.getByRole("heading", { level: 1, name: "Meera & Arjun's wedding" });
    await expect(heading).toBeVisible();
    // EM-06: the persistent notice on the plan screen.
    await expect(page.getByText("This is a starting point. Edit anything.")).toBeVisible();
    await expect(page.getByText("₹15,00,000 (INR)")).toBeVisible();
    await expect(page.getByText("200 · Sangeet: 120")).toBeVisible();
    await expect(page.getByText("Udaipur, India")).toBeVisible();

    await page.reload();
    await expect(heading).toBeVisible(FIRST_LOAD);
    await expect(page.getByText("90 days to plan", { exact: false })).toBeVisible();

    await page.getByRole("link", { name: "All events" }).click();
    await expect(page.getByRole("link", { name: "Meera & Arjun's wedding" }).first()).toBeVisible();
  });

  test("errors are shown, linked to their fields, and focus moves to the first one (UX-11)", async ({ page }) => {
    await openForm(page);
    await page.getByRole("button", { name: "Continue" }).click();

    const occasionType = page.getByRole("radiogroup", { name: "Occasion type" });
    expect(await descriptions(occasionType)).toContain("Choose the occasion type.");
    const planStyle = page.getByRole("radiogroup", { name: "Plan style" });
    expect(await descriptions(planStyle)).toContain("Choose a plan style.");
    await expect(page.getByRole("radio", { name: /^Birthday/ })).toBeFocused();
    await expect(page).toHaveURL(/\/events\/new$/);

    const eventName = page.getByLabel("Event name");
    await expect(eventName).toHaveAttribute("aria-invalid", "true");
    expect(await descriptions(eventName)).toContain("Enter the event name.");
    expect(await descriptions(page.getByLabel("Total budget"))).toContain("Enter the total budget.");
    expect(await descriptions(page.getByLabel("Expected guests", { exact: true }))).toContain("Enter the number of guests.");

    // EM-55: the event must be after today.
    await page.getByLabel("Event date").fill(isoInDays(0));
    expect(await descriptions(page.getByLabel("Event date"))).toContain("The event date must be after today.");

    // EM-38 (b): another currency's symbol is refused, never converted or read as zero.
    const currency = page.getByRole("combobox", { name: "Currency" });
    await currency.fill("INR");
    await currency.press("Enter");
    await page.getByLabel("Total budget").fill("$5,000");
    expect(await descriptions(page.getByLabel("Total budget"))).toContain(
      "This event uses INR. Currency conversion isn't supported.",
    );
    await expect(page.getByText(/Understood as/)).toHaveCount(0);

    await expectNoSeriousA11yViolations(page);
  });

  test("'Try an example' fills both steps with the demo persona's inputs (UX-10)", async ({ page }) => {
    test.slow();
    await openForm(page);
    await page.getByRole("button", { name: "Jaipur wedding, ₹8 lakh" }).click();

    await expect(page.getByLabel("Event name")).toHaveValue("Ananya & Rohan's wedding");
    await expect(page.getByText("Understood as ₹8,00,000")).toBeVisible();
    await expect(page.getByText("120 days to plan")).toBeVisible();
    await expect(page.getByLabel("Part 1 name")).toHaveValue("Mehendi evening");
    await expectNoSeriousA11yViolations(page);
    await expectNoHorizontalScroll(page);

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Must-haves")).toHaveValue(/Vegetarian Rajasthani thali/);
    await expect(page.getByRole("radio", { name: "First time planning something like this" })).toBeChecked();
    await expectNoSeriousA11yViolations(page);
    await expectNoHorizontalScroll(page);

    // Back keeps what was entered.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByLabel("City")).toHaveValue("Jaipur");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Create event" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ananya & Rohan's wedding" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("150 · Mehendi evening: 60")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("step 2 can't be reached without valid details (EM-02)", async ({ page }) => {
    await page.goto("/events/new?step=2");
    await expect(page).toHaveURL(/\/events\/new$/, FIRST_LOAD);
    await expect(page.getByRole("heading", { name: "Step 1 of 2: Event basics" })).toBeVisible();
  });
});

test.describe("event creation in other currencies", () => {
  test.use({ locale: "de-DE" });

  test("reads '€8.000' as eight thousand and formats it for de-DE (EM-37, EM-38)", async ({ page }) => {
    await openForm(page);
    const currency = page.getByRole("combobox", { name: "Currency" });
    await currency.fill("euro");
    await currency.press("Enter");
    await expect(currency).toHaveValue("EUR");
    await page.getByLabel("Total budget").fill("€8.000");
    await expect(page.getByText("Understood as 8.000 €")).toBeVisible();
  });
});
