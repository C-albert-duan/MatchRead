/**
 * Live client against a local app and the local database.
 *
 *   LIVE_CLIENT_URL=http://127.0.0.1:3002 npx playwright test e2e/live-client.spec.ts
 *
 * Start that app with E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY set to the local project.
 * The fixture is removed when the file finishes.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

const SLUG = "pgtap-live-client";
const PROVIDER = "91080";
const PLAYERS = ["i80a", "i80b", "i80c", "i80d"] as const;
const FIRST = `${SLUG}-r0-m0`;
const PARENT = `${SLUG}-r1-m0`;

test.use({ baseURL: process.env.LIVE_CLIENT_URL || "http://127.0.0.1:3002" });
test.describe.configure({ mode: "serial", timeout: 180_000 });

function serviceEnv() {
  const root = path.resolve(process.cwd(), "../..");
  const out = execSync("npx supabase status -o env", {
    encoding: "utf8",
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const read = (name: string) => {
    const line = out.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line?.slice(name.length + 1).replace(/^"|"$/g, "") ?? "";
  };
  const url = read("API_URL");
  const key = read("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("local Supabase service role was not found");
  return { url, key };
}

let api = "";
let serviceKey = "";
let matchId = "";
let parentId = "";
let sideA = "";
let previousListener: Record<string, unknown> | null = null;
let view: Page;
/** Provider clock written by the stale step. The next frame must be strictly later. */
let staleClock = "";

const BASE = process.env.LIVE_CLIENT_URL || "http://127.0.0.1:3002";

function cell(page: Page, ref: string) {
  return page.locator(`[data-public-ref="${ref}"]`);
}

async function rest(table: string, options: {
  method?: string;
  query?: string;
  body?: unknown;
  prefer?: string;
}) {
  const response = await fetch(`${api}/rest/v1/${table}${options.query ? `?${options.query}` : ""}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer ?? "return=representation",
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function beat() {
  await rest("listener_health", {
    method: "POST",
    query: "on_conflict=id",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      id: "listener",
      transport: "rest",
      connection: "up",
      last_heartbeat_at: new Date().toISOString(),
      last_error: null,
    },
  });
}

async function writeLive(partial: Record<string, unknown>) {
  await rest("live_match_state", {
    method: "POST",
    query: "on_conflict=match_id",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      match_id: matchId,
      tournament_id: await tournamentId(),
      public_ref: FIRST,
      phase: "in_play",
      score_text: "1-0",
      points_text: "15-0",
      serving_side: null,
      provisional_winner_ref: null,
      sequence: 1,
      sequence_source: "seq",
      frame_key: "client-1",
      source: "replay",
      received_at: new Date().toISOString(),
      flag: "live",
      stats: null,
      ...partial,
    },
  });
}

async function tournamentId() {
  const rows = await rest("tournaments", { query: `select=id&slug=eq.${SLUG}` });
  const id = rows?.[0]?.id;
  if (!id) throw new Error("fixture tournament is missing");
  return id as string;
}

async function setTabHidden(page: Page, hidden: boolean) {
  await page.evaluate((isHidden) => {
    Object.defineProperty(Document.prototype, "visibilityState", {
      configurable: true,
      get: () => (isHidden ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function removeFixture() {
  await rest("live_match_state", {
    method: "DELETE",
    query: `public_ref=eq.${FIRST}`,
    prefer: "return=minimal",
  });
  await rest("tournaments", {
    method: "DELETE",
    query: `slug=eq.${SLUG}`,
    prefer: "return=minimal",
  });
  await rest("players", {
    method: "DELETE",
    query: `provider_id=in.(${PLAYERS.join(",")})`,
    prefer: "return=minimal",
  });
}

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  const env = serviceEnv();
  api = env.url;
  serviceKey = env.key;
  const prior = await rest("listener_health", { query: "select=*&id=eq.listener" });
  previousListener = prior?.[0] ?? null;

  await removeFixture();
  const events = await rest("tournaments", {
    method: "POST",
    body: {
      slug: SLUG,
      name: "Live Client Fixture",
      tour: "atp",
      tier: "tour_250",
      starts_on: "2026-10-09",
      ends_on: "2026-10-10",
      draw_size: 4,
      provider_id: PROVIDER,
      venue_tz: "UTC",
      ingestion_enabled: true,
      published_at: "2026-10-09T12:00:00.000Z",
    },
  });
  const eventId = events[0].id as string;

  const people: string[] = [];
  for (const [providerId, lastName] of [
    ["i80a", "Alpha"],
    ["i80b", "Beta"],
    ["i80c", "Gamma"],
    ["i80d", "Delta"],
  ] as const) {
    const rows = await rest("players", {
      method: "POST",
      query: "on_conflict=provider_id",
      prefer: "resolution=merge-duplicates,return=representation",
      body: { provider_id: providerId, last_name: lastName },
    });
    people.push(rows[0].id);
  }
  sideA = people[0];
  await rest("seats", {
    method: "POST",
    body: people.map((playerId, position) => ({
      tournament_id: eventId,
      position,
      kind: "player",
      player_id: playerId,
    })),
  });
  const first = await rest("matches", {
    method: "POST",
    body: {
      tournament_id: eventId,
      round: 0,
      index_in_round: 0,
      side_a_player_id: people[0],
      side_b_player_id: people[1],
    },
  });
  await rest("matches", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      tournament_id: eventId,
      round: 0,
      index_in_round: 1,
      side_a_player_id: people[2],
      side_b_player_id: people[3],
    },
  });
  matchId = first[0].id;
  const parent = await rest("matches", {
    method: "POST",
    body: { tournament_id: eventId, round: 1, index_in_round: 0 },
  });
  parentId = parent[0].id;
  await beat();
  await warmRealtime(browser);
  view = await browser.newPage({ baseURL: BASE });
});

/**
 * F-2: right after `supabase db reset` the Realtime server is cold, and
 * "Subscribed to PostgreSQL" can come seconds after the join reply. The layer
 * reads a second snapshot for that (catch-up.ts); this pushes one frame
 * through a throwaway page so the tests start on a warm server, then removes it.
 */
async function warmRealtime(browser: Browser) {
  const page = await browser.newPage({ baseURL: BASE });
  try {
    await page.goto(`/tournaments/${SLUG}`, { waitUntil: "domcontentloaded" });
    await expect(cell(page, FIRST)).toHaveAttribute("data-resolution", /.+/);
    await writeLive({ sequence: 1, frame_key: "warm-up", score_text: "0-0", points_text: "0-0" });
    await expect(cell(page, FIRST).locator("[data-live-score]")).toContainText("0-0", { timeout: 60_000 });
  } finally {
    await page.close();
    await rest("live_match_state", {
      method: "DELETE",
      query: `public_ref=eq.${FIRST}`,
      prefer: "return=minimal",
    });
  }
}

test.afterAll(async () => {
  await view?.close();
  if (!api) return;
  await removeFixture();
  if (previousListener) {
    await rest("listener_health", {
      method: "POST",
      query: "on_conflict=id",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: previousListener,
    });
  }
});

test("a bracket score changes without a browser refresh", async () => {
  const page = view;
  await beat();
  await writeLive({
    sequence: 1,
    frame_key: "client-1",
    score_text: "1-0",
    points_text: "15-0",
    phase: "in_play",
    flag: "live",
    received_at: new Date().toISOString(),
  });
  await page.goto(`/tournaments/${SLUG}`, { waitUntil: "domcontentloaded" });
  const first = cell(page, FIRST);
  await expect(first.locator("[data-live-score]")).toContainText("1-0", { timeout: 20_000 });
  await expect(first).toHaveAttribute("data-resolution", "live");

  await writeLive({
    sequence: 2,
    frame_key: "client-2",
    score_text: "6-4,1-1",
    points_text: "0-15",
    received_at: new Date().toISOString(),
  });
  await expect(first.locator("[data-live-score]")).toContainText("6-4,1-1", { timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`/tournaments/${SLUG}`));
  await expect(cell(page, PARENT).locator("[data-seat-source='empty']")).toHaveCount(2);
});

test("the client recovers a score after a realtime disconnect", async () => {
  const page = view;
  await beat();
  const first = cell(page, FIRST);
  await expect(first.locator("[data-live-score]")).toContainText("6-4,1-1");
  await page.context().setOffline(true);
  await writeLive({
    sequence: 3,
    frame_key: "client-3",
    score_text: "6-4,2-2",
    points_text: "30-0",
    received_at: new Date().toISOString(),
  });
  await expect(first.locator("[data-live-score]")).toContainText("6-4,1-1");
  await page.context().setOffline(false);
  await beat();
  await expect(first.locator("[data-live-score]")).toContainText("6-4,2-2", { timeout: 20_000 });
});

test("returning from the background refetches the current score", async () => {
  const page = view;
  await beat();
  const first = cell(page, FIRST);
  await setTabHidden(page, true);
  await writeLive({
    sequence: 4,
    frame_key: "client-4",
    score_text: "6-4,3-3",
    points_text: "40-15",
    received_at: new Date().toISOString(),
  });
  await expect(first.locator("[data-live-score]")).toContainText("6-4,2-2");
  const refetch = page.waitForResponse(
    (response) => response.url().includes("/api/live") && response.request().method() === "POST"
  );
  await setTabHidden(page, false);
  await refetch;
  await expect(first.locator("[data-live-score]")).toContainText("6-4,3-3", { timeout: 20_000 });
});

test("a score with no update past the threshold shows stale", async () => {
  const page = view;
  await beat();
  const first = cell(page, FIRST);
  const observed = new Date(Date.now() - 50_000).toISOString();
  staleClock = new Date().toISOString();
  await writeLive({
    sequence: 5,
    frame_key: "client-5",
    score_text: "6-4,3-3",
    points_text: "40-15",
    occurred_at: staleClock,
    received_at: observed,
  });
  await expect(first).toHaveAttribute("data-observed-at", observed, { timeout: 20_000 });
  await expect(first.locator("[data-live-badge]")).toHaveText("Stale");
  await expect(first).toHaveAttribute("data-live-stale", "true");
  await expect(first.locator("[data-live-score]")).toContainText("6-4,3-3");
});

test("a provisional final waits for the official result and does not fill the next seat", async () => {
  const page = view;
  await beat();
  await writeLive({
    sequence: 6,
    frame_key: "client-6",
    phase: "provisional_final",
    flag: "provisional",
    score_text: "6-4,6-2",
    points_text: null,
    provisional_winner_ref: "i80a",
    occurred_at: new Date(Date.parse(staleClock) + 60_000).toISOString(),
    received_at: new Date().toISOString(),
  });
  const first = cell(page, FIRST);
  await expect(first).toHaveAttribute("data-resolution", "provisional", { timeout: 20_000 });
  await expect(first.locator("[data-live-note]")).toHaveText("Awaiting official result");
  await expect(first.locator("[data-live-score]")).toContainText("6-4 6-2");
  await expect(first).not.toHaveAttribute("data-has-winner", "true");
  const parent = cell(page, PARENT);
  await expect(parent.locator("[data-seat-source='empty']")).toHaveCount(2);
  await expect(parent.locator("[data-player-ref]")).toHaveCount(0);
  await expect(parent).not.toHaveAttribute("data-has-winner", "true");
});

test("an official result replaces the provisional line", async () => {
  const page = view;
  await beat();
  const now = new Date().toISOString();
  await rest("matches", {
    method: "PATCH",
    query: `id=eq.${matchId}`,
    prefer: "return=minimal",
    body: {
      winner_player_id: sideA,
      official_score: "6-4 6-2",
      settled_at: now,
      fact_kind: "played",
      voided: false,
    },
  });
  await rest("matches", {
    method: "PATCH",
    query: `id=eq.${parentId}`,
    prefer: "return=minimal",
    body: { side_a_player_id: sideA },
  });
  await rest("live_match_state", {
    method: "DELETE",
    query: `match_id=eq.${matchId}`,
    prefer: "return=minimal",
  });

  const first = cell(page, FIRST);
  await expect(first.locator(".match-state")).toHaveText("Official", { timeout: 20_000 });
  await expect(first.locator("[data-live-note]")).toHaveCount(0);
  await expect(first).toHaveAttribute("data-resolution", "official");
  await expect(first.locator(".match-score")).toContainText("6-4 6-2");
  await expect(first.locator("[data-official-winner='true']")).toContainText("Alpha");
  const parent = cell(page, PARENT);
  await expect(parent.locator("[data-official-winner='true']")).toHaveCount(0);
  await expect(parent.locator("[data-seat='0']")).toContainText("Alpha");
  await expect(parent.locator("[data-seat-source='stored']")).toHaveCount(1);
});
