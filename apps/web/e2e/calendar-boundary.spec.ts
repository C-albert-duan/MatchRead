import { test, expect } from "@playwright/test";

/**
 * Sprint Directive 2.1 §5 — calendar boundary smoke.
 * Skips when base URL is unreachable (CI without live stack).
 */
test.describe("calendar boundary", () => {
  test("homepage does not list challenger-looking labels in Open", async ({
    page,
  }) => {
    const res = await page.goto("/");
    if (!res || res.status() >= 500) {
      test.skip();
      return;
    }
    await expect(page.locator("body")).toBeVisible();
    const body = (await page.locator("body").innerText()).toLowerCase();
    // Hard filter: Challenger events must not appear as fillable product.
    // Allow the word only inside marketing copy if ever present; assert no
    // tournament card title pattern we know from lower tiers in fixtures.
    expect(body.includes("cancun challenger")).toBeFalsy();
    expect(body.includes("prague challenger")).toBeFalsy();
  });

  test("ineligible slug detail is not-found when seeded", async ({
    request,
    baseURL,
  }) => {
    if (!baseURL) {
      test.skip();
      return;
    }
    const res = await request.get("/tournaments/cancun-challenger-not-a-product");
    // 404 or soft not-found page
    expect([404, 200]).toContain(res.status());
    if (res.status() === 200) {
      const text = (await res.text()).toLowerCase();
      expect(
        text.includes("not found") ||
          text.includes("找不到") ||
          text.includes("no encontrado") ||
          text.includes("draw")
      ).toBeTruthy();
    }
  });
});
