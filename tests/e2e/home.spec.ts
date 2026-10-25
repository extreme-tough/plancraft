import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("home page (S0)", () => {
  test("sends the security headers with a fresh nonce per request (ENG-08)", async ({ request }) => {
    const first = await request.get("/");
    const second = await request.get("/");
    const csp = first.headers()["content-security-policy"] ?? "";

    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(second.headers()["content-security-policy"]).not.toBe(csp);
    expect(first.headers()["x-content-type-options"]).toBe("nosniff");
    expect(first.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(first.headers()["x-powered-by"]).toBeUndefined();
  });

  test("renders with no CSP violations or console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "PlanCraft" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("has no serious or critical accessibility violations (UX-11)", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("offers a skip link as the first focusable element (UX-11)", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("never scrolls horizontally (UX-12)", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
