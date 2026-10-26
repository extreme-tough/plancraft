import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const DEMO_BANNER = /Shared demo account:.*other reviewers can see and change this data/;
/** Waits that follow a sign-in or sign-out round-trip. */
const AUTH_STEP = { timeout: 15_000 };

async function expectDemo(page: Page): Promise<void> {
  // The first sign-in also loads the Firebase SDK and warms the server, so give it room.
  await expect(page.getByText("Shared demo account", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(DEMO_BANNER)).toBeVisible();
}

test.describe("demo access (EM-58)", () => {
  test("opening the app signs in to the shared demo with no clicks", async ({ page }) => {
    await page.goto("/");
    await expectDemo(page);
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  });

  test("every visitor gets a token for the same shared account, and no password is involved", async ({ request, browser }) => {
    test.slow(); // Two token requests plus two full sign-ins in fresh browsers.
    const uids = await Promise.all(
      [1, 2].map(async () => {
        const response = await request.post("/api/demo/session");
        expect(response.ok()).toBe(true);
        const body = (await response.json()) as { data: { token: string } };
        const payload = JSON.parse(Buffer.from(body.data.token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
          uid: string;
          claims?: { demo?: boolean };
        };
        expect(payload.claims?.demo).toBe(true);
        return payload.uid;
      }),
    );
    expect(uids).toEqual(["demo-shared", "demo-shared"]);

    const [first, second] = [await browser.newContext(), await browser.newContext()];
    try {
      const [a, b] = [await first.newPage(), await second.newPage()];
      await Promise.all([a.goto("/"), b.goto("/")]);
      await expectDemo(a);
      await expectDemo(b);
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("signing out offers a choice, and 'Enter the demo' goes back in", async ({ page }) => {
    test.slow(); // Three sign-in steps: demo, sign out, demo again.
    await page.goto("/");
    await expectDemo(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/welcome$/, AUTH_STEP);
    await expect(page.getByRole("heading", { name: "Welcome to PlanCraft" })).toBeVisible();

    // Coming back to "/" after an explicit sign-out doesn't silently re-enter the demo.
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/, AUTH_STEP);

    await page.getByRole("button", { name: "Enter the demo" }).click();
    await expect(page).toHaveURL(/\/$/, AUTH_STEP);
    await expectDemo(page);
  });

  test("the welcome page has no serious accessibility violations", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { name: "Welcome to PlanCraft" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});

test.describe("Google sign-in (EM-57)", () => {
  test("replaces the demo session with the user's own, private account", async ({ page }) => {
    test.slow(); // Demo sign-in, then the multi-step emulator popup.
    await page.goto("/");
    await expectDemo(page);

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    const popup = await popupPromise;
    // The Auth emulator's stand-in for Google's sign-in page.
    await popup.getByText("Add new account").click();
    await popup.getByText("Auto-generate user information").click();
    await popup.getByRole("button", { name: /Sign in with Google\.com/i }).click();

    await expect(page.getByText("Shared demo account", { exact: true })).toBeHidden(AUTH_STEP);
    await expect(page.getByText(DEMO_BANNER)).toBeHidden();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Your events" })).toBeVisible();
  });
});
