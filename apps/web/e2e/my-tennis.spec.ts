/**
 * My Tennis against a local app and the local database.
 *
 *   LIVE_CLIENT_URL=http://127.0.0.1:3002 npx playwright test e2e/my-tennis.spec.ts
 *
 * Start that app with E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY set to the
 * local project. A throwaway user and a 4-player draw are created and removed.
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const BASE = process.env.LIVE_CLIENT_URL || "http://127.0.0.1:3002";
const STAMP = Date.now();
const SLUG = `pgtap-me-${STAMP}`;
const EMAIL = `pgtap-me-${STAMP}@example.test`;
const PASSWORD = randomBytes(18).toString("base64url");
const NAMES = ["Ames", "Brook", "Cole", "Dunn"] as const;

test.use({ baseURL: BASE });
test.describe.configure({ mode: "serial", timeout: 120_000 });

let api = "";
let anonKey = "";
let serviceKey = "";
let userId = "";
let tournamentId = "";
let liveMatchId = "";
let firstMatchId = "";
const playerIds: Record<string, string> = {};

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

async function rest(table: string, body: unknown, query = "", method = "POST", prefer = "return=representation") {
  const response = await fetch(`${api}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function signIn(context: BrowserContext) {
  const response = await fetch(`${api}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const session = await response.json();
  if (!response.ok) throw new Error(`sign in ${response.status}`);
  const key = `sb-${new URL(api).hostname.split(".")[0]}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const host = new URL(BASE).hostname;
  await context.addCookies([
    { name: "mr_remember", value: "1", domain: host, path: "/" },
    { name: key, value, domain: host, path: "/" },
  ]);
}

test.beforeAll(async () => {
  const env = localEnv();
  api = env.url;
  anonKey = env.anon;
  serviceKey = env.service;

  const created = await fetch(`${api}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  const user = await created.json();
  if (!created.ok) throw new Error(`create user ${created.status}`);
  userId = user.id;
  await rest("profiles", { id: userId, display_name: "Me Spec" }, "on_conflict=id", "POST", "resolution=merge-duplicates,return=minimal");

  const [event] = await rest("tournaments", {
    slug: SLUG,
    name: "Me Spec Open",
    tour: "atp",
    starts_on: "2026-10-25",
    ends_on: "2099-12-31",
    tier: "tour_250",
    draw_size: 4,
    ingestion_enabled: false,
  });
  tournamentId = event.id;
  const players = await rest(
    "players",
    NAMES.map((name, i) => ({ provider_id: `${SLUG}-p${i}`, last_name: name }))
  );
  const id = (name: string) => players.find((row: { last_name: string }) => row.last_name === name).id;
  for (const name of NAMES) playerIds[name] = id(name);
  await rest(
    "seats",
    NAMES.map((name, position) => ({ tournament_id: tournamentId, position, kind: "player", player_id: id(name) }))
  );
  const soon = new Date(Date.now() + 55 * 60_000).toISOString();
  const base = {
    tournament_id: tournamentId,
    side_b_player_id: null,
    winner_player_id: null,
    official_score: null,
    settled_at: null,
    scheduled_at: null,
    has_time: false,
  };
  const matches = await rest("matches", [
    {
      ...base, round: 0, index_in_round: 0, external_ref: `${SLUG}-r0-m0`,
      side_a_player_id: id("Ames"), side_b_player_id: id("Brook"),
      winner_player_id: id("Ames"), official_score: "6-3 6-4", settled_at: new Date().toISOString(),
    },
    {
      ...base, round: 0, index_in_round: 1, external_ref: `${SLUG}-r0-m1`,
      side_a_player_id: id("Cole"), side_b_player_id: id("Dunn"), scheduled_at: soon, has_time: true,
    },
    { ...base, round: 1, index_in_round: 0, external_ref: `${SLUG}-r1-m0`, side_a_player_id: id("Ames") },
  ]);
  const match = (round: number, index: number) =>
    matches.find((row: { round: number; index_in_round: number }) => row.round === round && row.index_in_round === index).id;
  liveMatchId = match(0, 1);
  firstMatchId = match(0, 0);

  const [league] = await rest("leagues", {
    owner_id: userId, slug: `${SLUG}-l`, name: "Me Spec League", format: "single", is_solo: true,
  });
  await rest("members", { league_id: league.id, user_id: userId, role: "commissioner" });
  await rest("league_tournaments", { league_id: league.id, tournament_id: tournamentId });
  const [bracket] = await rest("brackets", {
    league_id: league.id, tournament_id: tournamentId, user_id: userId, submitted_at: new Date().toISOString(),
  });
  await rest("picks", [
    { bracket_id: bracket.id, match_id: match(0, 0), player_id: id("Ames") },
    { bracket_id: bracket.id, match_id: match(0, 1), player_id: id("Cole") },
    { bracket_id: bracket.id, match_id: match(1, 0), player_id: id("Cole") },
  ]);
});

test.afterAll(async () => {
  if (!api) return;
  if (userId) await rest("leagues", null, `owner_id=eq.${userId}`, "DELETE");
  await rest("tournaments", null, `slug=eq.${SLUG}`, "DELETE");
  await rest("players", null, `provider_id=like.${SLUG}-*`, "DELETE");
  if (userId) {
    await fetch(`${api}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
  }
});

test("before play: the morning Stage counts down to the next match of yours", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  await signIn(context);
  const page = await context.newPage();
  await page.goto("/me");
  const stage = page.locator(".stage");
  await expect(stage).toHaveAttribute("data-treatment", "morning");
  await expect(stage.locator("[role=status]")).toHaveText("Before play");
  await expect(stage.locator(".stage-number")).toHaveText(/Cole vs Dunn starts in (5\d|60) minutes/);
  await expect(page.locator(".triad-cell[data-kind=banked] .triad-value")).toHaveText("1");
  await expect(page.locator(".triad-cell[data-kind=ceiling] .triad-value")).toHaveText("6");
  await context.close();
});

test("the server sends the page itself, not a loading shell", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  await signIn(context);
  const response = await context.request.get("/me");
  const html = await response.text();
  expect(response.status()).toBe(200);
  expect(html).toContain("Your day in tennis");
  expect(html).toContain('data-treatment="morning"');
  // The navigation progress label rides in the RSC payload on every page;
  // what matters is the visible document, as in raw-html.spec.ts.
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  expect(visible).not.toContain("Loading…");
  expect(html).not.toContain("page-skeleton");
  await context.close();
});

test("a locked league: a match that decides first place swings the league", async ({ browser }) => {
  // A rival tied with the user who backs Dunn where the user backs Cole. The
  // rival's bracket is read through the user's own session, as in production.
  const rivalEmail = `pgtap-me-rival-${STAMP}@example.test`;
  const created = await fetch(`${api}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: rivalEmail, password: PASSWORD, email_confirm: true }),
  });
  const rival = await created.json();
  if (!created.ok) throw new Error(`create rival ${created.status}`);
  const [league] = await rest("leagues", {
    owner_id: userId, slug: `${SLUG}-swing`, name: "Me Spec Swing", format: "single", is_solo: false,
  });
  try {
    await rest("profiles", { id: rival.id, display_name: "Rival" }, "on_conflict=id", "POST", "resolution=merge-duplicates,return=minimal");
    await rest("members", [
      { league_id: league.id, user_id: userId, role: "commissioner" },
      { league_id: league.id, user_id: rival.id, role: "member" },
    ]);
    await rest("league_tournaments", {
      league_id: league.id, tournament_id: tournamentId, locked_at: new Date().toISOString(),
    });
    const brackets = await rest("brackets", [
      { league_id: league.id, tournament_id: tournamentId, user_id: userId, submitted_at: new Date().toISOString() },
      { league_id: league.id, tournament_id: tournamentId, user_id: rival.id, submitted_at: new Date().toISOString() },
    ]);
    const bracketOf = (owner: string) => brackets.find((row: { user_id: string }) => row.user_id === owner).id;
    await rest("picks", [
      { bracket_id: bracketOf(userId), match_id: firstMatchId, player_id: playerIds.Ames },
      { bracket_id: bracketOf(userId), match_id: liveMatchId, player_id: playerIds.Cole },
      { bracket_id: bracketOf(rival.id), match_id: firstMatchId, player_id: playerIds.Ames },
      { bracket_id: bracketOf(rival.id), match_id: liveMatchId, player_id: playerIds.Dunn },
    ]);

    const context = await browser.newContext({ baseURL: BASE });
    await signIn(context);
    const page = await context.newPage();
    await page.goto("/me");
    const swing = page.locator(".my-list .my-row").filter({ hasText: "This match can change first place in your league" });
    // The bracket context is cached per user for 15 s.
    await expect
      .poll(
        async () => {
          await page.reload();
          return swing.count();
        },
        { timeout: 45_000, intervals: [2_000] }
      )
      .toBeGreaterThan(0);
    await expect(swing.first()).toHaveAttribute("data-public-ref", `${SLUG}-r0-m1`);
    await context.close();
  } finally {
    await rest("leagues", null, `id=eq.${league.id}`, "DELETE");
    await fetch(`${api}/auth/v1/admin/users/${rival.id}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
  }
});

async function beat(connection: "up" | "down") {
  await rest(
    "listener_health",
    { id: "listener", transport: "rest", connection, last_heartbeat_at: new Date().toISOString(), last_error: null },
    "on_conflict=id",
    "POST",
    "resolution=merge-duplicates,return=minimal"
  );
}

test("with the listener down, a stored live row is not shown as in play", async ({ browser }) => {
  await beat("down");
  await rest("live_match_state", {
    match_id: liveMatchId,
    tournament_id: tournamentId,
    public_ref: `${SLUG}-r0-m1`,
    phase: "in_play",
    score_text: "3-6,2-1",
    points_text: "15-30",
    sequence: 1,
    sequence_source: "seq",
    frame_key: "me-spec-1",
    source: "replay",
    received_at: new Date().toISOString(),
    flag: "live",
  });
  const context = await browser.newContext({ baseURL: BASE });
  await signIn(context);
  const page = await context.newPage();
  await page.goto("/me");
  await expect(page.locator(".stage")).toHaveAttribute("data-treatment", "morning");
  await context.close();
});

test("in play: the champion's match leads the Stage and the list, with its reason", async ({ browser }) => {
  await beat("up");
  const context = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce" });
  await signIn(context);
  const page = await context.newPage();
  await page.goto("/me");
  const stage = page.locator(".stage");
  await expect(stage).toHaveAttribute("data-treatment", "live");
  await expect(stage.locator(".my-row-reason")).toHaveText("Your champion Cole is under pressure");
  await expect(stage.locator(".my-row-foot")).toContainText("5 points of your ceiling ride on this");
  const first = page.locator(".my-list .my-row").first();
  await expect(first).toHaveAttribute("data-public-ref", `${SLUG}-r0-m1`);
  await expect(first).toHaveAttribute("data-importance", "important");

  const badge = stage.locator("[data-live-badge]");
  await expect(badge).toBeVisible({ timeout: 20_000 });
  expect(await badge.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await context.close();
});

test("a live leader change re-ranks the page without a reload", async ({ browser }) => {
  await beat("up");
  const context = await browser.newContext({ baseURL: BASE });
  await signIn(context);
  const page = await context.newPage();
  await page.goto("/me");
  const stage = page.locator(".stage");
  await expect(stage.locator(".my-row-reason")).toHaveText("Your champion Cole is under pressure");
  await expect(stage.locator("[data-live-badge]")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });

  // Cole takes the lead: the reason is recomputed on the server and the page
  // follows well inside the 45 s background refresh.
  await rest(
    "live_match_state",
    {
      match_id: liveMatchId,
      tournament_id: tournamentId,
      public_ref: `${SLUG}-r0-m1`,
      phase: "in_play",
      score_text: "6-3,2-1",
      points_text: "15-0",
      sequence: 2,
      sequence_source: "seq",
      frame_key: "me-spec-2",
      source: "replay",
      received_at: new Date().toISOString(),
      flag: "live",
    },
    "on_conflict=match_id",
    "POST",
    "resolution=merge-duplicates,return=minimal"
  );
  await expect(stage.locator(".my-row-reason")).toHaveText("Your champion Cole is on court", { timeout: 15_000 });
  // Same document: re-ranked in place, not reloaded.
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  await context.close();
});

/** The bracket context is cached per user for 15 s, so reload until the Stage moves. */
async function reloadUntil(page: Page, treatment: string) {
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.locator(".stage").getAttribute("data-treatment");
      },
      { timeout: 45_000, intervals: [2_000] }
    )
    .toBe(treatment);
}

function fact(page: Page, label: string) {
  return page.locator(".stage-fact").filter({ hasText: label });
}

test("between matches: the Stage shows what just settled and what is next", async ({ browser }) => {
  // Overlay closed, so the stored live row no longer counts: Cole vs Dunn is scheduled again.
  await beat("down");
  // A second league whose pick on the settled first match lost.
  const [league] = await rest("leagues", {
    owner_id: userId, slug: `${SLUG}-l2`, name: "Me Spec League 2", format: "single", is_solo: true,
  });
  await rest("members", { league_id: league.id, user_id: userId, role: "commissioner" });
  await rest("league_tournaments", { league_id: league.id, tournament_id: tournamentId });
  const [bracket] = await rest("brackets", {
    league_id: league.id, tournament_id: tournamentId, user_id: userId, submitted_at: new Date().toISOString(),
  });
  await rest("picks", { bracket_id: bracket.id, match_id: firstMatchId, player_id: playerIds.Brook });

  const context = await browser.newContext({ baseURL: BASE });
  await signIn(context);
  const page = await context.newPage();
  await page.goto("/me");
  await reloadUntil(page, "next");
  const stage = page.locator(".stage");
  await expect(stage.locator("[role=status]")).toHaveText("Between matches");
  await expect(stage).toContainText("Just settled");
  await expect(stage.locator(".my-row").first()).toHaveAttribute("data-public-ref", `${SLUG}-r0-m0`);
  await expect(stage).toContainText("Up next");
  await expect(stage.locator(".stage-number")).toHaveText(/Cole vs Dunn starts in/);
  await context.close();
});

test("day settled: the reckoning counts settled matches and lost picks", async ({ browser }) => {
  await rest("live_match_state", null, `match_id=eq.${liveMatchId}`, "DELETE");
  await rest(
    "matches",
    { winner_player_id: playerIds.Dunn, official_score: "6-4 6-4", settled_at: new Date().toISOString() },
    `id=eq.${liveMatchId}`,
    "PATCH"
  );
  const context = await browser.newContext({ baseURL: BASE });
  await signIn(context);
  const page = await context.newPage();
  await page.goto("/me");
  await reloadUntil(page, "reckoning");
  await expect(page.locator(".stage [role=status]")).toHaveText("Day settled");
  await expect(fact(page, "Matches settled").locator(".stage-fact-value")).toHaveText("2");
  const lost = fact(page, "Picks lost");
  await expect(lost.locator(".stage-fact-value")).toHaveText("2");
  await expect(lost).toHaveAttribute("data-miss", "true");
  await context.close();
});

test("no brackets: the empty Stage points to the tournaments", async ({ browser }) => {
  await rest("leagues", null, `owner_id=eq.${userId}`, "DELETE");
  const context = await browser.newContext({ baseURL: BASE });
  await signIn(context);
  const page = await context.newPage();
  await page.goto("/me");
  await reloadUntil(page, "empty");
  await expect(page.locator(".stage [role=status]")).toHaveText("Nothing of yours today");
  await expect(page.locator(".stage a[href='/tournaments']")).toHaveText("Find a tournament");
  await context.close();
});
