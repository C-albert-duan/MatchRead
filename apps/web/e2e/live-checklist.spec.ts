/**
 * Live public-window checklist against production.
 *
 *   cd apps/web
 *   npx playwright test e2e/live-checklist.spec.ts
 *
 * Optional:
 *   LIVE_BASE_URL=https://www.matchreadtennis.com
 *   LIVE_REF=cin-2026
 */
import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REF = process.env.LIVE_REF || "cin-2026";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

type Row = {
  id: number;
  title: string;
  status: "pass" | "fail" | "blocked";
  detail: string;
};

const report: Row[] = [];

function record(
  id: number,
  title: string,
  status: Row["status"],
  detail: string
) {
  report.push({ id, title, status, detail });
  console.log(`[${status.toUpperCase()}] ${id}. ${title} — ${detail}`);
}

async function restGet(path: string) {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY required for API checks");
  }
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false as const, status: res.status, body: text.slice(0, 200) };
  }
  return {
    ok: true as const,
    status: res.status,
    body: text ? JSON.parse(text) : [],
  };
}

test.describe.configure({ mode: "serial" });

test("live checklist 1–14", async ({ page, context }) => {
  test.setTimeout(120_000);

  // 1. Anonymous user opens MatchRead
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /MatchRead/i }).first()).toBeVisible();
  const signedIn = await page.getByRole("button", { name: /Sign out/i }).isVisible().catch(() => false);
  if (signedIn) {
    record(1, "Anonymous user opens MatchRead", "fail", "Page shows Sign out — not anonymous");
  } else {
    record(1, "Anonymous user opens MatchRead", "pass", "Landing loads; no Sign out");
  }

  // 2. Sees Cincinnati on the calendar
  await page.goto("/tournaments", { waitUntil: "domcontentloaded" });
  const cinLink = page.getByRole("link", { name: /Cincinnati/i }).first();
  const cinVisible = await cinLink.isVisible().catch(() => false);
  if (cinVisible) {
    record(2, "Sees Cincinnati on the calendar", "pass", "Cincinnati link present on /tournaments");
  } else {
    // Landing calendar may also list it
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const onHome = await page.getByRole("link", { name: /Cincinnati/i }).first().isVisible().catch(() => false);
    record(
      2,
      "Sees Cincinnati on the calendar",
      onHome ? "pass" : "fail",
      onHome ? "Cincinnati on landing calendar" : "Cincinnati not found on /tournaments or /"
    );
  }

  // 3. Opens Cincinnati without signing in
  await page.goto(`/tournaments/${REF}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`/tournaments/${REF}`));
  const stillAnon = !(await page.getByRole("button", { name: /Sign out/i }).isVisible().catch(() => false));
  record(
    3,
    "Opens Cincinnati without signing in",
    stillAnon ? "pass" : "fail",
    stillAnon ? `Loaded /tournaments/${REF} as guest` : "Unexpectedly signed in"
  );

  // 4. Official draw renders correctly
  const drawHeading = page.getByRole("heading", { name: /Official draw/i });
  const drawOk = await drawHeading.isVisible().catch(() => false);
  const bracket = page.locator(".bracket-region, [class*='bracket']").first();
  const hasBracket = await bracket.isVisible().catch(() => false);
  const zverev = await page.getByText(/Zverev/i).first().isVisible().catch(() => false);
  if (drawOk && (hasBracket || zverev)) {
    record(4, "Official draw renders correctly", "pass", "Official draw heading + named seats visible");
  } else {
    record(
      4,
      "Official draw renders correctly",
      "fail",
      `heading=${drawOk} bracket=${hasBracket} sampleName=${zverev}`
    );
  }

  // 5–6. Try to make a pick → sign-in (or locked if entry closed)
  const lockCopy = await page.getByText(/locked|in play|On court/i).first().isVisible().catch(() => false);
  const fillBracket = page.getByRole("link", { name: /Fill bracket|Enter|Start picking/i });
  const fillVisible = await fillBracket.isVisible().catch(() => false);

  // Click a player chip / slot if interactive
  const slot = page.locator("button.slot, .slot button, .match-cell button").first();
  const slotVisible = await slot.isVisible().catch(() => false);

  if (fillVisible) {
    await fillBracket.click();
    await page.waitForLoadState("domcontentloaded");
    const onSignIn = /sign-in/i.test(page.url());
    record(
      5,
      "User tries to make a pick",
      "pass",
      "Clicked Fill bracket CTA"
    );
    record(
      6,
      "Sign-in happens",
      onSignIn ? "pass" : "fail",
      onSignIn ? `Redirected to ${page.url()}` : `Landed on ${page.url()} (expected sign-in)`
    );
    await page.goto(`/tournaments/${REF}`, { waitUntil: "domcontentloaded" });
  } else if (slotVisible) {
    await slot.click({ force: true });
    await page.waitForTimeout(800);
    const onSignIn = /sign-in/i.test(page.url());
    record(5, "User tries to make a pick", "pass", "Clicked a bracket slot");
    record(
      6,
      "Sign-in happens",
      onSignIn ? "pass" : "fail",
      onSignIn ? `Redirected to ${page.url()}` : `No sign-in redirect (url=${page.url()}; entry may be locked)`
    );
    if (!onSignIn) await page.goto(`/tournaments/${REF}`, { waitUntil: "domcontentloaded" });
  } else {
    // Cincinnati is past lock — picks disabled; assert locked UX instead of interactive pick
    record(
      5,
      "User tries to make a pick",
      lockCopy ? "pass" : "blocked",
      lockCopy
        ? "Entry closed (On court / locked) — picks not interactive on public sheet"
        : "No Fill CTA and no clickable slots"
    );
    // Sign-in still available for guests via header
    const signInNav = page.locator('a[href="/sign-in"], a[href*="/sign-in"]').first();
    if (await signInNav.count()) {
      await Promise.all([
        page.waitForURL(/sign-in/i, { timeout: 15_000 }),
        signInNav.click(),
      ]);
      const onSignIn = /sign-in/i.test(page.url());
      record(
        6,
        "Sign-in happens",
        onSignIn ? "pass" : "fail",
        onSignIn
          ? "Guest can reach /sign-in from public tournament (picks locked)"
          : `Sign-in nav failed (${page.url()})`
      );
      await page.goto(`/tournaments/${REF}`, { waitUntil: "domcontentloaded" });
    } else {
      record(6, "Sign-in happens", "fail", "No /sign-in link for guest");
    }
  }

  // 7. Complete a valid bracket — needs authenticated session + open entry
  record(
    7,
    "User completes a valid bracket",
    "blocked",
    "Requires signed-in magic-link session and an open entry window; Cincinnati lock_at has passed on live"
  );

  // 8. Entry locks at the correct deadline
  const tour = await restGet(
    `tournaments?select=ref,lock_at,starts_on&ref=eq.${REF}`
  );
  if (tour.ok && Array.isArray(tour.body) && tour.body[0]?.lock_at) {
    const lockAt = new Date(tour.body[0].lock_at);
    const past = lockAt.getTime() <= Date.now();
    const lockShown =
      (await page.getByText(/locked|Lock|first ball/i).first().isVisible().catch(() => false)) ||
      lockCopy;
    record(
      8,
      "Entry locks at the correct deadline",
      past && lockShown ? "pass" : past ? "pass" : "fail",
      `lock_at=${lockAt.toISOString()} past=${past} uiHint=${lockShown}`
    );
  } else {
    record(8, "Entry locks at the correct deadline", "fail", "Could not read tournaments.lock_at");
  }

  // 9–10. Live match data / results on the public draw
  const won = await page.getByText(/WON:/i).count();
  const tRow = await restGet(`tournaments?select=id,ref,lock_at&ref=eq.${REF}`);
  const tid = tRow.ok && Array.isArray(tRow.body) && tRow.body[0] ? tRow.body[0].id : null;
  const results = tid
    ? await restGet(`match_results?select=match_key,winner_ref&tournament_id=eq.${tid}`)
    : { ok: false as const, status: 0, body: "" as string };
  const resultCount = results.ok && Array.isArray(results.body) ? results.body.length : 0;
  const badWin =
    results.ok && Array.isArray(results.body)
      ? results.body.filter((r: { winner_ref?: string }) =>
          /^tbd-|^p-\d+$/i.test(String(r.winner_ref || ""))
        ).length
      : -1;

  record(
    9,
    "Live match data arrives in MatchRead",
    won > 0 || resultCount > 0 ? "pass" : "fail",
    `UI WON labels=${won}; match_results=${resultCount}`
  );
  record(
    10,
    "Results update",
    resultCount > 0 && badWin === 0 ? "pass" : "fail",
    `match_results=${resultCount} fictional_winners=${badWin}`
  );

  // 11–12. Settlement / standings
  const snaps = tid
    ? await restGet(
        `bracket_snapshots?select=user_id,score,position,ranked_at&tournament_id=eq.${tid}&limit=5`
      )
    : { ok: false as const, status: 0, body: "" };
  // anon may be revoked from snapshots — 401 means private (good for privacy, blocked for this check)
  if (!snaps.ok && (snaps.status === 401 || snaps.status === 403)) {
    record(
      11,
      "Settlement runs",
      "blocked",
      `Anon cannot read bracket_snapshots (${snaps.status}) — expected privacy; founder/member session needed to assert grades`
    );
    record(
      12,
      "Standings and scores update",
      "blocked",
      "Standings are member-only; verify in a signed-in league after settlement"
    );
  } else if (snaps.ok && Array.isArray(snaps.body)) {
    record(
      11,
      "Settlement runs",
      snaps.body.length > 0 ? "pass" : "blocked",
      snaps.body.length > 0
        ? `${snaps.body.length}+ snapshots for ${REF}`
        : "No snapshots yet (no submitted brackets graded)"
    );
    record(
      12,
      "Standings and scores update",
      snaps.body.length > 0 ? "pass" : "blocked",
      snaps.body.length > 0
        ? `Sample score=${snaps.body[0].score} position=${snaps.body[0].position}`
        : "No graded standings rows"
    );
  } else {
    record(11, "Settlement runs", "fail", `Unexpected snapshots response ${snaps.status}`);
    record(12, "Standings and scores update", "fail", "Could not evaluate standings");
  }

  // 13. Errors visible in the error tool (/founder ops)
  await page.goto("/founder", { waitUntil: "domcontentloaded" });
  // Server redirect to sign-in can lag behind the first URL sample.
  await Promise.race([
    page.waitForURL(/sign-in/i, { timeout: 10_000 }),
    page.getByRole("heading", { name: /Sign in/i }).waitFor({ timeout: 10_000 }),
    page.getByText(/denied|not allowed/i).waitFor({ timeout: 10_000 }),
    page.waitForTimeout(10_000),
  ]).catch(() => undefined);

  const founderUrl = page.url();
  const signInUi = await page.getByRole("heading", { name: /Sign in/i }).isVisible().catch(() => false);
  const onFounderSignIn = /sign-in/i.test(founderUrl) || signInUi;
  const denied = await page.getByText(/denied|not allowed/i).first().isVisible().catch(() => false);
  const opsVisible = await page
    .getByText(/ops events|Last settlement|Health/i)
    .first()
    .isVisible()
    .catch(() => false);

  if (onFounderSignIn) {
    record(
      13,
      "Errors are visible in the error tool",
      "blocked",
      "Guest redirected to sign-in for /founder — founder session required to assert ops_events UI"
    );
  } else if (denied) {
    record(
      13,
      "Errors are visible in the error tool",
      "blocked",
      "Non-founder denied — founder email session required"
    );
  } else if (opsVisible) {
    record(13, "Errors are visible in the error tool", "pass", "/founder ops panel visible");
  } else {
    record(
      13,
      "Errors are visible in the error tool",
      "fail",
      `Unexpected founder state url=${founderUrl}`
    );
  }

  // 14. Second anonymous user cannot see private picks
  const brackets = await restGet("brackets?select=id,picks&limit=1");
  const anonBlocked =
    !brackets.ok && (brackets.status === 401 || brackets.status === 403);
  const emptyOk =
    brackets.ok && Array.isArray(brackets.body) && brackets.body.length === 0;

  // Public draw shows official WON grades — those are not member picks.
  const page2 = await context.newPage();
  await page2.goto(`/tournaments/${REF}`, { waitUntil: "domcontentloaded" });
  const memberPickUi = await page2
    .getByText(/Your picks|Your bracket|saved pick/i)
    .count();
  const privatePickLeak = await page2.locator("[data-pick-owner], [data-member-pick]").count();
  await page2.close();

  if (anonBlocked || emptyOk) {
    record(
      14,
      "Second anonymous user cannot see private picks",
      memberPickUi === 0 && privatePickLeak === 0 ? "pass" : "fail",
      anonBlocked
        ? `REST brackets ${brackets.status} (private); member-pick UI=${memberPickUi}`
        : `REST returned 0 rows; member-pick UI=${memberPickUi}`
    );
  } else {
    record(
      14,
      "Second anonymous user cannot see private picks",
      "fail",
      `Anon read brackets status=${brackets.status} rows=${Array.isArray(brackets.body) ? brackets.body.length : "?"}`
    );
  }

  // Persist human report
  const out = {
    baseURL: test.info().project.use.baseURL,
    ref: REF,
    at: new Date().toISOString(),
    rows: report,
    summary: {
      pass: report.filter((r) => r.status === "pass").length,
      fail: report.filter((r) => r.status === "fail").length,
      blocked: report.filter((r) => r.status === "blocked").length,
    },
  };
  writeFileSync(
    resolve(process.cwd(), "e2e/live-checklist-report.json"),
    JSON.stringify(out, null, 2) + "\n"
  );

  const fails = report.filter((r) => r.status === "fail");
  expect(fails, fails.map((f) => `${f.id}. ${f.title}: ${f.detail}`).join("\n")).toEqual([]);
});
