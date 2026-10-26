import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  // The first sign-in also loads the Firebase SDK and warms the server, so give it room.
  await expect(page.getByRole("heading", { level: 1, name: "Your events" })).toBeVisible({ timeout: 15_000 });
}

test.describe("security headers (ENG-08)", () => {
  test("every page gets a fresh nonce and the static headers", async ({ request }) => {
    const first = await request.get("/welcome");
    const second = await request.get("/welcome");
    const csp = first.headers()["content-security-policy"] ?? "";

    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(second.headers()["content-security-policy"]).not.toBe(csp);
    expect(first.headers()["x-content-type-options"]).toBe("nosniff");
    expect(first.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(first.headers()["x-powered-by"]).toBeUndefined();
  });

  test("the demo-session endpoint refuses cross-site calls", async ({ request }) => {
    const response = await request.post("/api/demo/session", { headers: { "sec-fetch-site": "cross-site" } });
    expect(response.status()).toBe(403);
    expect(response.headers()["cache-control"]).toBe("no-store");
  });
});

test.describe("home page", () => {
  test("renders with no console errors or CSP violations", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await openHome(page);
    expect(errors).toEqual([]);
  });

  test("has no serious or critical accessibility violations (UX-11)", async ({ page }) => {
    await openHome(page);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("offers a skip link as the first focusable element (UX-11)", async ({ page }) => {
    await openHome(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("never scrolls horizontally (UX-12)", async ({ page }) => {
    await openHome(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
