import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

/** Plan generation (S4) against the emulators with the fixture provider (AI_PROVIDER=fixture). */

const FIRST_LOAD = { timeout: 15_000 };

async function createExampleEvent(page: Page): Promise<void> {
  await page.goto("/events/new");
  await page.getByRole("button", { name: "Jaipur wedding, ₹8 lakh" }).click(FIRST_LOAD);
  await page.getByRole("button", { name: "Continue to questions" }).click();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ananya & Rohan's wedding" })).toBeVisible(FIRST_LOAD);
}

async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}

function failWith(status: number, code: string, message: string, retryAfter?: number) {
  return (route: Route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: retryAfter ? { "Retry-After": String(retryAfter) } : {},
      body: JSON.stringify({ ok: false, error: { code, message, retryable: code !== "DAILY_LIMIT_REACHED" } }),
    });
}

test.describe("plan generation (AI-01, EM-03)", () => {
  test.use({ locale: "en-IN" });

  test("generates a plan from the event's own inputs and keeps it after a reload", async ({ page }) => {
    test.slow(); // Sign-in, event creation, the AI call through the server and a reload.
    await createExampleEvent(page);

    // EM-03 / EM-07: every event field and answer goes to the server.
    const requestPromise = page.waitForRequest((r) => r.url().endsWith("/api/ai/plan") && r.method() === "POST");
    await page.getByRole("button", { name: "Generate my plan" }).click();
    const sent = (await requestPromise).postDataJSON() as Record<string, unknown>;
    expect(sent).toMatchObject({
      useCase: "wedding",
      currency: "INR",
      budget: 800000,
      guestCount: 150,
      parts: [{ name: "Mehendi evening", guestCount: 60 }],
      answers: { priorities: ["venue", "catering", "photography"], accessibility: expect.stringContaining("step-free") },
    });

    // The plan replaces the generator: lines with labels and ranges, tasks, assumptions.
    await expect(page.getByRole("heading", { level: 2, name: /Budget lines/ })).toBeVisible(FIRST_LOAD);
    await expect(page.getByRole("heading", { level: 4, name: "Venue hire" })).toBeVisible();
    await expect(page.getByText("AI Estimate").first()).toBeVisible();
    await expect(page.getByText("₹2,40,000").first()).toBeVisible(); // 30 % of ₹8,00,000, split by code (EM-14)
    await expect(page.getByText(/allocated of ₹8,00,000/)).toBeVisible();
    await expect(page.getByText("After: Book venue").first()).toBeVisible(); // EM-23
    await expect(page.getByRole("heading", { level: 2, name: "Assumptions" })).toBeVisible(); // EM-11
    await expect(page.getByText("Do you already have a venue in mind?")).toBeVisible();
    await expect(page.getByText("This is a starting point. Edit anything.")).toBeVisible(); // EM-06
    await expectNoSeriousA11yViolations(page);

    await page.reload();
    await expect(page.getByRole("heading", { level: 4, name: "Venue hire" })).toBeVisible(FIRST_LOAD);
    await expect(page.getByRole("button", { name: "Generate my plan" })).toHaveCount(0);
  });
});

test.describe("plan generation fallbacks (spec §7.6, AI-12)", () => {
  test.use({ locale: "en-IN" });

  test("AI down: the error is announced, Retry works, and an empty plan invents nothing", async ({ page }) => {
    test.slow();
    await createExampleEvent(page);
    await page.route("**/api/ai/plan", failWith(503, "AI_UNAVAILABLE", "The AI service is unavailable right now. Please try again."));

    await page.getByRole("button", { name: "Generate my plan" }).click();
    await expect(page.getByText("The plan couldn't be generated")).toBeVisible();
    await expect(page.getByText("The AI service is unavailable right now. Please try again.")).toBeVisible();
    await expect(page.getByText("Your event is saved.", { exact: false })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Retry reaches the real fixture-backed server once the outage is over.
    await page.unroute("**/api/ai/plan");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("heading", { level: 4, name: "Venue hire" })).toBeVisible(FIRST_LOAD);
  });

  test("Start with an empty plan lists the categories and no amounts or tasks", async ({ page }) => {
    await createExampleEvent(page);
    await page.route("**/api/ai/plan", failWith(504, "AI_TIMEOUT", "The AI took too long to answer. Please try again."));
    await page.getByRole("button", { name: "Generate my plan" }).click();
    await expect(page.getByText("The AI took too long to answer.", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Start with an empty plan" }).click();
    await expect(page.getByText("No lines yet: nothing has been estimated for you.", { exact: false })).toBeVisible();
    for (const category of ["Venue", "Catering", "Contingency"]) await expect(page.getByText(category, { exact: true })).toBeVisible();
    await expect(page.getByText("AI Estimate")).toHaveCount(0);
    await expect(page.getByText("No tasks yet.")).toBeVisible();
  });

  test("a rate limit disables Retry with a countdown", async ({ page }) => {
    await createExampleEvent(page);
    await page.route("**/api/ai/plan", failWith(429, "RATE_LIMITED", "Too many AI requests. Please wait a moment and try again.", 30));
    await page.getByRole("button", { name: "Generate my plan" }).click();
    await expect(page.getByRole("button", { name: /Retry in \d+ s/ })).toBeDisabled();
  });

  test("the daily limit shows the friendly message and keeps the plan usable (spec §7.6)", async ({ page }) => {
    await createExampleEvent(page);
    await page.route(
      "**/api/ai/plan",
      failWith(
        429,
        "DAILY_LIMIT_REACHED",
        "We've reached today's limit for AI help. Your plan still works and you can keep editing. Please try the AI features again tomorrow.",
        3600,
      ),
    );
    await page.getByRole("button", { name: "Generate my plan" }).click();
    await expect(page.getByText("We've reached today's limit for AI help.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate my plan" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Start with an empty plan" })).toBeEnabled();
    await expectNoSeriousA11yViolations(page);
  });
});
