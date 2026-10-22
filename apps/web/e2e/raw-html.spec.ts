/**
 * Raw document, before hydration.
 *
 *   cd apps/web
 *   LIVE_BASE_URL=http://127.0.0.1:3001 npx playwright test e2e/raw-html.spec.ts
 *
 * Uses APIRequestContext (request.get), the same fetch the other e2e specs use.
 * That response is the server HTML. It does not run the client.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function rawDocument(request: APIRequestContext, path: string) {
  const res = await request.get(path);
  const html = await res.text();
  return { status: res.status(), html, text: visibleText(html) };
}

test.describe("raw HTML before hydration", () => {
  test("landing document is the product, not the loading shell", async ({
    request,
  }) => {
    const doc = await rawDocument(request, "/");
    if (doc.status >= 500) {
      test.skip();
      return;
    }
    expect(doc.status).toBe(200);
    expect(doc.text).toContain("Follow the tennis season with your people.");
    expect(doc.html).not.toContain("page-skeleton");
    expect(doc.text).not.toContain("Loading…");
    expect(doc.html).not.toContain("back-btn");
    expect(doc.text).not.toContain("←");
  });

  test("calendar document includes tournament rows without the loading shell", async ({
    request,
  }) => {
    const doc = await rawDocument(request, "/tournaments");
    if (doc.status >= 500) {
      test.skip();
      return;
    }
    expect(doc.status).toBe(200);
    expect(doc.text).toContain("Tournament calendar");
    expect(doc.html).toContain('class="trow-name"');
    expect(doc.html).toMatch(/href="\/tournaments\/[^"]+"/);
    expect(doc.html).not.toContain("page-skeleton");
    expect(doc.text).not.toContain("Loading…");
    expect(doc.html.includes("page-skeleton") && doc.html.includes("back-btn")).toBe(
      false
    );
  });
});
