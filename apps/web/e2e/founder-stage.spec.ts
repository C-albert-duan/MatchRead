/**
 * The Stage counters on /founder/integrity against a local app and database.
 *
 *   LIVE_CLIENT_URL=http://127.0.0.1:3002 npx playwright test e2e/founder-stage.spec.ts
 *
 * Start that app with E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY and
 * FOUNDER_EMAILS=founder-check@example.test. The founder user is created and removed.
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { expect, test } from "@playwright/test";

const BASE = process.env.LIVE_CLIENT_URL || "http://127.0.0.1:3002";
const EMAIL = "founder-check@example.test";
const PASSWORD = randomBytes(18).toString("base64url");

test.use({ baseURL: BASE });

let api = "";
let anonKey = "";
let serviceKey = "";
let userId = "";

function localEnv() {
  const out = execSync("npx supabase status -o env", {
    encoding: "utf8",
    cwd: path.resolve(process.cwd(), "../.."),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const read = (name: string) =>
    out.split(/\r?\n/).find((row) => row.startsWith(`${name}=`))?.slice(name.length + 1).replace(/^"|"$/g, "") ?? "";
  return { url: read("API_URL"), anon: read("ANON_KEY"), service: read("SERVICE_ROLE_KEY") };
}

async function admin(pathname: string, method: string, body?: unknown) {
  const response = await fetch(`${api}${pathname}`, {
    method,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

test.beforeAll(async () => {
  const env = localEnv();
  api = env.url;
  anonKey = env.anon;
  serviceKey = env.service;
  const listed = await admin("/auth/v1/admin/users?per_page=1000", "GET");
  const stale = listed.users?.find((user: { email?: string }) => user.email === EMAIL);
  if (stale) await admin(`/auth/v1/admin/users/${stale.id}`, "DELETE");
  const user = await admin("/auth/v1/admin/users", "POST", { email: EMAIL, password: PASSWORD, email_confirm: true });
  userId = user.id;
  await admin("/rest/v1/profiles?on_conflict=id", "POST", { id: userId, display_name: "Founder Check" });
  // Three Stage changes in one hour for one user.
  await admin(
    "/rest/v1/stage_events",
    "POST",
    ["morning", "live", "next"].map((state) => ({ user_id: userId, state, match_ref: null }))
  );
});

test.afterAll(async () => {
  if (userId) await admin(`/auth/v1/admin/users/${userId}`, "DELETE");
});

test("the founder sees Stage changes and the busiest user-hour", async ({ browser }) => {
  const response = await fetch(`${api}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const session = await response.json();
  expect(response.ok).toBe(true);
  const context = await browser.newContext({ baseURL: BASE });
  const host = new URL(BASE).hostname;
  await context.addCookies([
    { name: "mr_remember", value: "1", domain: host, path: "/" },
    {
      name: `sb-${new URL(api).hostname.split(".")[0]}-auth-token`,
      value: `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`,
      domain: host,
      path: "/",
    },
  ]);
  const page = await context.newPage();
  await page.goto("/founder/integrity");
  await expect(page).toHaveURL(/\/founder\/integrity/);
  const tile = page.locator("dl > div, dl").filter({ has: page.getByText("Stage changes, last 24 h", { exact: true }) }).last();
  await expect(tile.locator(".health-value")).toHaveText("3");
  await expect(tile).toContainText("Busiest user-hour: 3");
  // More than two changes in one user-hour is the S2 event mark.
  await expect(tile).toContainText("Event");
  await page.screenshot({ path: test.info().outputPath("founder-integrity.png"), fullPage: true });
  await context.close();
});
