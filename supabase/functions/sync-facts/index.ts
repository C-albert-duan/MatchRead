// supabase/functions/sync-facts
// One shot: fetch Tennis API facts → upsert tournaments, players, seats, matches.
//
// POST /functions/v1/sync-facts
// Authorization: Bearer <INGEST_SECRET>
// Body (optional):
//   { "dryRun"?: false, "year"?: 2026, "slug"?: "t-atp-21347", "force"?: false }
//
// Secrets: INGEST_SECRET, RAPIDAPI_KEY, RAPIDAPI_HOST (optional),
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (platform)
//
// Deploy: npx supabase functions deploy sync-facts --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { applyDrawFacts } from "../_shared/apply-draw.ts";
import { applyMatchResults } from "../_shared/apply-results.ts";
import {
  createClient as createRapid,
  getDualTourCalendar,
  getLiveEvents,
  getTournamentFixtures,
  getTournamentResults,
  mapLiveFinishedToIngest,
  mapResultsToIngest,
  namedFirstRoundPairs,
  overlayOfficialDraw,
  resolveOfficialSeats,
  shouldPollDraw,
  bindResultsByPlayerPair,
  diffProviderAuthoritative,
  unboundProviderFixtures,
  proposeShapeBRepairs,
  resolveLiveEvent,
  getExtendEvent,
  normalizeSurface,
  normalizeEnvironment,
  normalizeTier,
  defaultTournamentSpanDays,
  UnknownProviderValue,
  assertDrawBelongsToTournament,
} from "../_shared/rapidapi.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DAY_MS = 86_400_000;
/** Keep events starting in this window (past → future). */
const WINDOW_PAST_DAYS = 21;
const WINDOW_FUTURE_DAYS = 60;
/** Cron/full runs: cap draw+results work so Edge does not idle-timeout (504). */
const MAX_EVENTS_PER_RUN = 10;

/**
 * Known main-draw first days when provider calendar `date` is the week banner.
 * Sprint Directive 2.1 §3 — do not equate starts_on with main_draw_starts_on.
 */
const PRODUCT_MAIN_DRAW: Record<string, string> = {
  "t-atp-21349": "2026-08-30", // US Open ATP
  "t-wta-16743": "2026-08-30", // US Open WTA
  "t-atp-21348": "2026-08-23", // Winston-Salem
  "t-atp-21347": "2026-08-13", // Cincinnati ATP
  "t-wta-16740": "2026-08-13", // Cincinnati WTA
  "t-wta-16741": "2026-08-24", // Monterrey
  "t-wta-16742": "2026-08-24", // Cleveland
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "POST required" }, 405);
  }

  const secret = Deno.env.get("INGEST_SECRET");
  const token = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!secret || token !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const rapidKey = Deno.env.get("RAPIDAPI_KEY")?.trim();
  if (!rapidKey) {
    return json({ error: "RAPIDAPI_KEY secret is not set" }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  let body: {
    dryRun?: boolean;
    year?: number;
    slug?: string;
    ref?: string;
    force?: boolean;
    /** Upsert calendar metadata only (surface/tier/ends_on) — skip draw/results. */
    calendarOnly?: boolean;
  } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const dryRun = Boolean(body.dryRun);
  const force = Boolean(body.force);
  const calendarOnly = Boolean(body.calendarOnly);
  const onlySlug = body.slug?.trim() || body.ref?.trim() || null;
  const year = Number(body.year) || new Date().getUTCFullYear();

  const admin = createClient(supabaseUrl, serviceKey);
  const host =
    Deno.env.get("RAPIDAPI_HOST")?.trim() ||
    "tennis-api-atp-wta-itf.p.rapidapi.com";
  const rapidClient = createRapid({ key: rapidKey, host });

  const log: string[] = [];
  const env = {
    dryRun,
    force,
  };

  try {
    const calendar = await syncTournamentsFromCalendar(
      admin,
      rapidClient,
      year,
      onlySlug,
      dryRun,
      log
    );

    if (calendarOnly) {
      return json({
        ok: true,
        calendarOnly: true,
        calendar,
        log,
      });
    }

    const events = await listSyncedEvents(admin, onlySlug);
    log.push(`events in window: ${events.length}`);

    const publish = {
      announced: 0,
      published: 0,
      pending: 0,
      errors: 0,
    };
    const reconcile = {
      ingested: 0,
      skipped: 0,
      errors: 0,
      slugs: [] as string[],
    };

    let liveEvents: unknown[] = [];
    try {
      const live = await getLiveEvents(rapidClient);
      liveEvents = live.events ?? [];
      log.push(`live events ${liveEvents.length}`);
    } catch (err) {
      log.push(
        `live skipped: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    for (const event of events) {
      try {
        const pub = await syncEventDraw(
          admin,
          rapidClient,
          env,
          event,
          log
        );
        if (pub.status === "published") publish.published += 1;
        else if (pub.status === "announced") publish.announced += 1;
        else if (pub.status === "pending") publish.pending += 1;

        const rec = await syncEventResults(
          admin,
          rapidClient,
          env,
          event,
          liveEvents,
          log
        );
        if (rec.ingested > 0) {
          reconcile.ingested += rec.ingested;
          reconcile.slugs.push(event.slug);
        } else {
          reconcile.skipped += 1;
        }
      } catch (err) {
        publish.errors += 1;
        reconcile.errors += 1;
        log.push(
          `${event.slug} error: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    return json({
      ok: true,
      dryRun,
      year,
      calendar,
      publish,
      reconcile,
      log,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`fatal: ${message}`);
    return json({ ok: false, error: message, log }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

type CalendarRow = {
  id?: string | number;
  name?: string;
  date?: string;
  start?: string;
  end?: string;
  endDate?: string;
  /** Legacy string; live API usually sends `court`. */
  surface?: string | { id?: number; name?: string } | null;
  /** Tennis API calendar court object — primary surface source. */
  court?: string | { id?: number; name?: string } | null;
  type?: string;
  category?: string;
  /** Tennis API level label, e.g. "Challenger 75". */
  tier?: string;
};

type SyncedEvent = {
  id: string;
  slug: string;
  name: string;
  tour: "atp" | "wta";
  provider_id: string;
  draw_size: number;
  starts_on: string | null;
  main_draw_starts_on: string | null;
  ends_on: string | null;
  lock_at: string | null;
  published_at: string | null;
  draw_checked_at: string | null;
  surface: string | null;
  tier: string | null;
  bracket_eligible: boolean;
  ingestion_enabled: boolean;
  ref: string;
  api_name?: string;
};

/** Discover ATP+WTA calendar and upsert tournament rows (no seats yet). */
async function syncTournamentsFromCalendar(
  admin: ReturnType<typeof createClient>,
  rapid: ReturnType<typeof createRapid>,
  year: number,
  onlySlug: string | null,
  dryRun: boolean,
  log: string[]
) {
  const since = `${year}-01-01`;
  const dual = await getDualTourCalendar(rapid, year, {
    since,
    pageSize: 500,
    pageNo: 1,
  });

  const rows: {
    tour: "atp" | "wta";
    row: CalendarRow;
  }[] = [
    ...(dual.atp?.tournaments ?? []).map((row: CalendarRow) => ({
      tour: "atp" as const,
      row,
    })),
    ...(dual.wta?.tournaments ?? []).map((row: CalendarRow) => ({
      tour: "wta" as const,
      row,
    })),
  ];

  const now = Date.now();
  const candidates = rows
    .map(({ tour, row }) => mapCalendarTournament(tour, row, year))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .filter((t) => inWindow(t.starts_on, now) || onlySlug === t.slug);

  const filtered = onlySlug
    ? candidates.filter((t) => t.slug === onlySlug)
    : candidates;

  log.push(
    `calendar ${year}: atp=${dual.atp?.tournaments?.length ?? 0} wta=${
      dual.wta?.tournaments?.length ?? 0
    } → upsert ${filtered.length}`
  );

  let upserted = 0;
  if (!dryRun && filtered.length) {
    // One row per (tour, provider_id) — ATP/WTA may share numeric ids.
    const byKey = new Map<string, (typeof filtered)[number]>();
    for (const t of filtered) {
      byKey.set(`${t.tour}:${t.provider_id}`, t);
    }
    const rows = [...byKey.values()];

    // Preserve product main_draw_starts_on — provider calendar `date` is the
    // week banner, not main-draw day. Never overwrite a known product date.
    const slugs = rows.map((t) => t.slug);
    const { data: existingRows } = await admin
      .from("tournaments")
      .select("slug, main_draw_starts_on")
      .in("slug", slugs);
    const existingMain = new Map<string, string | null>();
    for (const row of existingRows ?? []) {
      existingMain.set(
        String(row.slug),
        row.main_draw_starts_on ? String(row.main_draw_starts_on).slice(0, 10) : null
      );
    }

    const rowsOut = rows.map((t) => {
      const productMain =
        PRODUCT_MAIN_DRAW[t.slug] ||
        existingMain.get(t.slug) ||
        t.main_draw_starts_on ||
        t.starts_on;
      return {
        slug: t.slug,
        name: t.name,
        tour: t.tour,
        surface: t.surface,
        environment: t.environment,
        tier: t.tier,
        starts_on: t.starts_on,
        main_draw_starts_on: productMain,
        ends_on: t.ends_on,
        provider_id: t.provider_id,
        ...("draw_size" in t && t.draw_size != null
          ? { draw_size: t.draw_size }
          : {}),
      };
    });

    const { error } = await admin
      .from("tournaments")
      .upsert(rowsOut, { onConflict: "slug" });
    if (error) throw new Error(`tournaments upsert: ${error.message}`);
    upserted = rowsOut.length;

    // Clear legacy force_on if any rows remain (override can only subtract).
    await admin
      .from("tournaments")
      .update({ product_override: null })
      .eq("product_override", "force_on");

    for (const t of filtered) {
      if (t.tierAlert) {
        await admin.from("ops_events").insert({
          kind: "ingest",
          name: "tier_unmapped",
          payload: { slug: t.slug, alert: t.tierAlert },
        });
      }
    }
  }

  return {
    scanned: rows.length,
    upserted: dryRun ? 0 : upserted,
    dryRunCandidates: dryRun ? filtered.length : undefined,
  };
}

function mapCalendarTournament(
  tour: "atp" | "wta",
  row: CalendarRow,
  year: number
) {
  const providerId = String(row?.id ?? "").trim();
  if (!providerId) return null;

  const name = String(row?.name ?? "").trim();
  if (!name) return null;

  // Skip obvious doubles-only noise when the API labels it.
  const blob = `${name} ${row?.type ?? ""} ${row?.category ?? ""} ${
    row?.tier ?? ""
  }`.toLowerCase();
  if (/\bdoubles\b/.test(blob) && !/\bsingles\b/.test(blob)) return null;

  const starts =
    String(row.date || row.start || "").slice(0, 10) || `${year}-01-01`;

  const tierInfo = normalizeTier(row.category, row.type, row.tier);

  const providerEnd = String(row.endDate || row.end || "").slice(0, 10);
  let ends = providerEnd;
  if (!ends || ends < starts) {
    const span = defaultTournamentSpanDays(tierInfo.tier);
    const startMs = Date.parse(`${starts}T12:00:00.000Z`);
    ends = Number.isNaN(startMs)
      ? starts
      : new Date(startMs + span * DAY_MS).toISOString().slice(0, 10);
  }

  // Live calendar: surface lives on `court`; some feeds still use `surface`.
  const surfaceRaw = row.court ?? row.surface;
  let surface: string | null = null;
  let environment: string | null = null;
  try {
    surface = normalizeSurface(surfaceRaw);
    environment = normalizeEnvironment(surfaceRaw);
  } catch (err) {
    if (
      err instanceof UnknownProviderValue ||
      (err as Error)?.name === "UnknownProviderValue"
    ) {
      surface = null;
      environment = normalizeEnvironment(surfaceRaw);
    } else {
      throw err;
    }
  }

  const drawSize = inferDrawSizeHint(name, blob);

  return {
    slug: `t-${tour}-${providerId}`,
    name,
    tour,
    surface,
    environment,
    tier: tierInfo.tier,
    tierAlert: tierInfo.alert,
    starts_on: starts,
    // Provider week date only — product main_draw_starts_on is preserved on upsert.
    ends_on: ends,
    provider_id: providerId,
    ...(drawSize ? { draw_size: drawSize } : {}),
  };
}

/** Soft hint from provider category/type only — never city or slam names. Official sheet overwrites. */
function inferDrawSizeHint(_name: string, blob: string): number | null {
  if (/\b(grand\s*slam|slam)\b/.test(blob)) return 128;
  if (/\b(masters|1000)\b/.test(blob)) return 128;
  if (/\b(500|250)\b/.test(blob)) return 32;
  if (/\bchallenger\b/.test(blob)) return 32;
  return null;
}

function inWindow(startsOn: string | null, now: number): boolean {
  if (!startsOn) return true;
  const t = Date.parse(startsOn);
  if (Number.isNaN(t)) return true;
  return (
    t >= now - WINDOW_PAST_DAYS * DAY_MS &&
    t <= now + WINDOW_FUTURE_DAYS * DAY_MS
  );
}

function eventInPlayForSync(
  e: {
    main_draw_starts_on: string | null;
    starts_on: string | null;
    ends_on?: string | null;
  },
  nowMs: number
): boolean {
  const day = e.main_draw_starts_on || e.starts_on;
  if (!day) return false;
  const startMs = Date.parse(`${String(day).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(startMs) || nowMs < startMs) return false;
  if (e.ends_on) {
    const endMs = Date.parse(`${String(e.ends_on).slice(0, 10)}T23:59:59.999Z`);
    if (!Number.isNaN(endMs) && nowMs > endMs) return false;
  } else if (nowMs - startMs > 14 * DAY_MS) {
    return false;
  }
  return true;
}

async function listSyncedEvents(
  admin: ReturnType<typeof createClient>,
  onlySlug: string | null
): Promise<SyncedEvent[]> {
  const { data, error } = await admin
    .from("tournaments")
    .select(
      "id, slug, name, tour, draw_size, provider_id, starts_on, main_draw_starts_on, ends_on, lock_at, published_at, draw_checked_at, surface, tier, bracket_eligible, ingestion_enabled"
    )
    .not("provider_id", "is", null);
  if (error) throw new Error(error.message);

  const now = Date.now();
  let events = (data ?? [])
    .filter((row) => row?.slug && row.provider_id)
    .filter((row) => row.ingestion_enabled !== false)
    .map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      tour: (row.tour === "wta" ? "wta" : "atp") as "atp" | "wta",
      provider_id: String(row.provider_id),
      draw_size: Number(row.draw_size) || 0,
      starts_on: (row.starts_on as string) ?? null,
      main_draw_starts_on: (row.main_draw_starts_on as string) ?? null,
      ends_on: (row.ends_on as string) ?? null,
      lock_at: (row.lock_at as string) ?? null,
      published_at: (row.published_at as string) ?? null,
      draw_checked_at: (row.draw_checked_at as string) ?? null,
      surface: (row.surface as string) ?? null,
      tier: (row.tier as string) ?? null,
      bracket_eligible: Boolean(row.bracket_eligible),
      ingestion_enabled: row.ingestion_enabled !== false,
      ref: row.slug as string,
      api_name: row.name as string,
    }))
    .filter(
      (e) =>
        inWindow(e.main_draw_starts_on || e.starts_on, now) ||
        onlySlug === e.slug
    );

  if (onlySlug) events = events.filter((e) => e.slug === onlySlug);
  else {
    const nowMs = Date.now();
    const mainMs = (e: SyncedEvent) => {
      const day = e.main_draw_starts_on || e.starts_on;
      if (!day) return nowMs;
      const t = Date.parse(`${String(day).slice(0, 10)}T12:00:00Z`);
      return Number.isNaN(t) ? nowMs : t;
    };

    // Always sync in-play events that still need a publish (never starve by cap).
    const inPlayUnpublished = events.filter(
      (e) =>
        e.bracket_eligible &&
        !e.published_at &&
        eventInPlayForSync(e, nowMs)
    );
    const inPlayIds = new Set(inPlayUnpublished.map((e) => e.id));

    const rest = events.filter((e) => !inPlayIds.has(e.id));
    rest.sort((a, b) => {
      const ae = a.bracket_eligible ? 0 : 1;
      const be = b.bracket_eligible ? 0 : 1;
      if (ae !== be) return ae - be;
      const ap = a.published_at ? 1 : 0;
      const bp = b.published_at ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return Math.abs(mainMs(a) - nowMs) - Math.abs(mainMs(b) - nowMs);
    });

    inPlayUnpublished.sort(
      (a, b) => Math.abs(mainMs(a) - nowMs) - Math.abs(mainMs(b) - nowMs)
    );

    const room = Math.max(0, MAX_EVENTS_PER_RUN - inPlayUnpublished.length);
    events = [...inPlayUnpublished, ...rest.slice(0, room)];
  }
  return events;
}

function matchupsFromPairs(
  pairs: ReturnType<typeof namedFirstRoundPairs>,
  prefix: string
) {
  return pairs.map((p) => ({
    provider_match_id: String(p.id),
    match_key: `fx-${p.id}`,
    player1_ref: `${prefix}-${p.p1.id}`,
    player1_provider_id: p.p1.id,
    player1_last_name: p.p1.last_name,
    player1_country: p.p1.country_code,
    player1_seed: p.p1.seed,
    player2_ref: `${prefix}-${p.p2.id}`,
    player2_provider_id: p.p2.id,
    player2_last_name: p.p2.last_name,
    player2_country: p.p2.country_code,
    player2_seed: p.p2.seed,
    scheduled_at: p.instant?.scheduled_at ?? null,
    has_time: Boolean(p.instant?.has_time),
  }));
}

async function postRebuild(
  admin: ReturnType<typeof createClient>,
  env: {
    dryRun: boolean;
    force: boolean;
  },
  payload: Record<string, unknown>,
  log: string[]
) {
  if (env.dryRun) {
    log.push("rebuild-draw dry-run (not posted)");
    return;
  }
  const body = { ...payload, force: Boolean(env.force || payload.force) };
  const result = await applyDrawFacts(admin, body, log);
  if (!result.ok) {
    log.push(`rebuild-draw failed: ${result.error}`);
    throw new Error(`rebuild-draw failed: ${result.error}`);
  }
  log.push(`rebuild-draw ok ${result.tournament_id}`);
}

async function syncEventDraw(
  admin: ReturnType<typeof createClient>,
  rapid: ReturnType<typeof createRapid>,
  env: {
    dryRun: boolean;
    force: boolean;
  },
  event: SyncedEvent,
  log: string[]
): Promise<{ status: "published" | "announced" | "pending" }> {
  const label = event.slug;

  // Adaptive draw poll — still always refresh fixtures/announced matchups.
  const { count: tbdCount } = await admin
    .from("seats")
    .select("position", { count: "exact", head: true })
    .eq("tournament_id", event.id)
    .eq("kind", "tbd");

  const pollDraw =
    env.force ||
    shouldPollDraw({
      lock_at: event.lock_at,
      starts_on: event.starts_on,
      main_draw_starts_on: event.main_draw_starts_on,
      hasDraw: Boolean(event.published_at),
      tbdCount: tbdCount ?? 0,
      draw_checked_at: event.draw_checked_at,
    });

  const { fixtures } = await getTournamentFixtures(
    rapid,
    event.tour,
    event.provider_id
  );

  let archiveSingles: unknown[] = [];
  try {
    const archive = await getTournamentResults(
      rapid,
      event.tour,
      event.provider_id
    );
    archiveSingles = archive.singles ?? [];
  } catch {
    archiveSingles = [];
  }

  const pairs = namedFirstRoundPairs(fixtures);
  const matchups = matchupsFromPairs(pairs, event.tour);

  // Announced R0 pairs only — never seats from fixtures.
  if (matchups.length > 0) {
    await postRebuild(
      admin,
      env,
      {
        tournament_slug: event.slug,
        tournament_patch: {
          provider_id: event.provider_id,
          tour: event.tour,
          name: event.name,
        },
        matchups,
      },
      log
    );
  }

  if (!pollDraw) {
    log.push(`${label} draw poll skipped (adaptive interval)`);
    return {
      status: event.published_at
        ? "published"
        : matchups.length
          ? "announced"
          : "pending",
    };
  }

  // Official /draws only — fixture fallback gated inside resolveOfficialSeats.
  const official = await resolveOfficialSeats(rapid, event, fixtures);
  if (!official.ok) {
    await admin
      .from("tournaments")
      .update({ draw_checked_at: new Date().toISOString() })
      .eq("id", event.id);
    const seen = Array.isArray(
      (official as { draw_types_seen?: string[] }).draw_types_seen
    )
      ? (official as { draw_types_seen: string[] }).draw_types_seen.join(",")
      : "";
    const reason =
      (official as { drawClass?: { reason?: string } }).drawClass?.reason ||
      "";
    log.push(
      `${label} pending — ${official.reason}${
        official.firstRound ? ` (${official.firstRound})` : ""
      }` +
        (seen || reason
          ? ` draw_types_seen=${seen || reason} main_singles_found=false action=noop`
          : "")
    );
    return { status: matchups.length ? "announced" : "pending" };
  }

  try {
    assertDrawBelongsToTournament(
      {
        provider_id: event.provider_id,
        tour: event.tour,
      },
      {
        provider_id: event.provider_id,
        tour: event.tour,
      }
    );
  } catch (err) {
    log.push(
      `${label} identity assert failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    await admin.from("ops_events").insert({
      kind: "ingest",
      name: "draw_identity_reject",
      payload: { slug: event.slug, error: String(err) },
    });
    return { status: "pending" };
  }

  if ((official as { source?: string }).source === "first-round") {
    log.push(`${label} rejected fixture-sourced draw`);
    return { status: matchups.length ? "announced" : "pending" };
  }

  // Never publish a non-eligible draw (override cannot promote).
  if (!event.bracket_eligible) {
    log.push(`${label} draw held — not bracket_eligible (ingest only)`);
    // Still store seats for coverage, but apply-draw will refuse published_at
    // when integrity sees bracket_eligible false.
  }

  const built = overlayOfficialDraw(official.seats, fixtures, {
    prefix: event.tour,
    results: archiveSingles,
  });

  if (!built.ok) {
    log.push(`${label} pending — ${built.reason}`);
    return { status: matchups.length ? "announced" : "pending" };
  }

  await postRebuild(
    admin,
    env,
    {
      tournament_slug: event.slug,
      tournament_patch: {
        draw_size: built.drawSize,
        provider_id: event.provider_id,
        tour: event.tour,
        name: event.name,
      },
      seats: built.seats,
      results: built.results ?? [],
      schedule: built.schedule ?? [],
      matches: built.matches ?? {},
      matchups,
      force: env.force,
    },
    log
  );
  log.push(`${label} published ${built.drawSize}-draw`);
  return { status: "published" };
}

async function loadProviderMaps(
  admin: ReturnType<typeof createClient>,
  tournamentId: string
) {
  const players: Record<string, string> = {};
  const { data: seatRows } = await admin
    .from("seats")
    .select("player_id")
    .eq("tournament_id", tournamentId)
    .not("player_id", "is", null);
  const playerIds = [
    ...new Set(
      (seatRows ?? []).map((s) => s.player_id as string).filter(Boolean)
    ),
  ];
  if (playerIds.length > 0) {
    const { data: people } = await admin
      .from("players")
      .select("id, provider_id")
      .in("id", playerIds);
    for (const p of people ?? []) {
      if (p.provider_id) {
        const id = String(p.provider_id);
        players[id] = id;
      }
    }
  }

  const matches: Record<string, string> = {};
  const { data: matchRows } = await admin
    .from("matches")
    .select("provider_match_id, round, index_in_round")
    .eq("tournament_id", tournamentId)
    .not("provider_match_id", "is", null);
  for (const row of matchRows ?? []) {
    if (row.provider_match_id != null) {
      matches[String(row.provider_match_id)] =
        `r${row.round}-m${row.index_in_round}`;
    }
  }
  return { players, matches };
}

async function loadMatchSides(
  admin: ReturnType<typeof createClient>,
  tournamentId: string
) {
  const { data: matchRows } = await admin
    .from("matches")
    .select(
      "id, round, index_in_round, provider_match_id, side_a_player_id, side_b_player_id"
    )
    .eq("tournament_id", tournamentId);

  const playerIds = [
    ...new Set(
      (matchRows ?? [])
        .flatMap((m) => [m.side_a_player_id, m.side_b_player_id])
        .filter(Boolean) as string[]
    ),
  ];
  const providerByUuid = new Map<string, string>();
  if (playerIds.length) {
    const { data: people } = await admin
      .from("players")
      .select("id, provider_id")
      .in("id", playerIds);
    for (const p of people ?? []) {
      if (p.provider_id) providerByUuid.set(String(p.id), String(p.provider_id));
    }
  }

  return (matchRows ?? []).map((m) => ({
    match_id: m.id as string,
    match_key: `r${m.round}-m${m.index_in_round}`,
    round: Number(m.round),
    index_in_round: Number(m.index_in_round),
    provider_match_id: m.provider_match_id
      ? String(m.provider_match_id)
      : null,
    side_a_provider_id: m.side_a_player_id
      ? providerByUuid.get(String(m.side_a_player_id)) ?? null
      : null,
    side_b_provider_id: m.side_b_player_id
      ? providerByUuid.get(String(m.side_b_player_id)) ?? null
      : null,
  }));
}

async function loadSeatProviders(
  admin: ReturnType<typeof createClient>,
  tournamentId: string
): Promise<{ position: number; provider_player_id: string | null }[]> {
  const { data: seats } = await admin
    .from("seats")
    .select("position, player_id")
    .eq("tournament_id", tournamentId)
    .order("position", { ascending: true });
  const playerIds = [
    ...new Set(
      (seats ?? []).map((s) => s.player_id as string | null).filter(Boolean) as string[]
    ),
  ];
  const providerByUuid = new Map<string, string>();
  if (playerIds.length) {
    const { data: people } = await admin
      .from("players")
      .select("id, provider_id")
      .in("id", playerIds);
    for (const p of people ?? []) {
      if (p.provider_id) providerByUuid.set(String(p.id), String(p.provider_id));
    }
  }
  return (seats ?? []).map((s) => ({
    position: Number(s.position),
    provider_player_id: s.player_id
      ? providerByUuid.get(String(s.player_id)) ?? null
      : null,
  }));
}

async function ensurePlayersByProvider(
  admin: ReturnType<typeof createClient>,
  providerIds: string[],
  log: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(providerIds.map(String).filter(Boolean))];
  if (!ids.length) return out;
  const { data: existing } = await admin
    .from("players")
    .select("id, provider_id")
    .in("provider_id", ids);
  for (const p of existing ?? []) {
    if (p.provider_id) out.set(String(p.provider_id), String(p.id));
  }
  const missing = ids.filter((id) => !out.has(id));
  if (!missing.length) return out;
  // Fail closed: never invent a display name. Only bind known players.
  log.push(`shapeB unresolved players: ${missing.join(",")}`);
  return out;
}

async function applyShapeBRepairs(
  admin: ReturnType<typeof createClient>,
  event: SyncedEvent,
  repairs: ReturnType<typeof proposeShapeBRepairs>,
  dryRun: boolean,
  log: string[]
): Promise<
  {
    match_key: string;
    winner_provider_id: string;
    winner_ref: string;
    voided: boolean;
    provider_match_id: string;
  }[]
> {
  const ingest: {
    match_key: string;
    winner_provider_id: string;
    winner_ref: string;
    voided: boolean;
    provider_match_id: string;
  }[] = [];
  if (!repairs.length) return ingest;

  const needed = repairs.flatMap((r) => [
    r.side_a_provider_id,
    r.side_b_provider_id,
    r.winner_provider_id,
  ]);
  const playerMap = await ensurePlayersByProvider(admin, needed, log);

  for (const r of repairs) {
    const sideA = playerMap.get(r.side_a_provider_id);
    const sideB = playerMap.get(r.side_b_provider_id);
    const winner = playerMap.get(r.winner_provider_id);
    if (!sideA || !sideB || !winner) {
      log.push(
        `${event.slug} shapeB skip ${r.match_key}: player_unresolved`
      );
      continue;
    }
    if (winner !== sideA && winner !== sideB) {
      log.push(`${event.slug} shapeB skip ${r.match_key}: winner not on sides`);
      continue;
    }

    if (!dryRun) {
      if (r.action === "create") {
        const { error } = await admin.from("matches").insert({
          tournament_id: event.id,
          round: r.round,
          index_in_round: r.index_in_round,
          provider_match_id: r.provider_match_id,
          side_a_player_id: sideA,
          side_b_player_id: sideB,
        });
        if (error) {
          // Unique race → treat as fill
          if (!/duplicate|unique/i.test(error.message)) {
            log.push(`${event.slug} shapeB create ${r.match_key}: ${error.message}`);
            continue;
          }
        } else {
          log.push(`${event.slug} shapeB created ${r.match_key}`);
        }
      }

      const patch: Record<string, unknown> = {
        provider_match_id: r.provider_match_id,
        side_a_player_id: sideA,
        side_b_player_id: sideB,
      };
      const { error: upErr } = await admin
        .from("matches")
        .update(patch)
        .eq("tournament_id", event.id)
        .eq("round", r.round)
        .eq("index_in_round", r.index_in_round)
        .is("winner_player_id", null);
      if (upErr) {
        log.push(`${event.slug} shapeB fill ${r.match_key}: ${upErr.message}`);
        continue;
      }
    }

    ingest.push({
      match_key: r.match_key,
      winner_provider_id: r.winner_provider_id,
      winner_ref: r.winner_provider_id,
      voided: false,
      provider_match_id: r.provider_match_id,
    });
  }
  return ingest;
}

async function syncEventResults(
  admin: ReturnType<typeof createClient>,
  rapid: ReturnType<typeof createRapid>,
  env: {
    dryRun: boolean;
    force: boolean;
  },
  event: SyncedEvent,
  liveEvents: unknown[],
  log: string[]
): Promise<{ ingested: number }> {
  const maps = await loadProviderMaps(admin, event.id);
  const matchSides = await loadMatchSides(admin, event.id);
  if (matchSides.length === 0) {
    log.push(`${event.slug} no match tree yet`);
    return { ingested: 0 };
  }

  const { singles } = await getTournamentResults(
    rapid,
    event.tour,
    event.provider_id
  );

  const mapping = {
    tournament_id: event.id,
    provider_tournament_id: event.provider_id,
    tour: event.tour,
    players: maps.players,
    matches: maps.matches,
  };

  // Prefer pair+round binding; fall back to fixture-id map.
  const bound = bindResultsByPlayerPair(
    (singles ?? []) as Parameters<typeof bindResultsByPlayerPair>[0],
    matchSides,
    maps.players
  );
  const mapped = mapResultsToIngest(singles ?? [], mapping);

  // Apply provider_match_id bindings discovered via pair match.
  if (!env.dryRun) {
    for (const b of bound.bindings) {
      const parsed = b.match_key.match(/^r(\d+)-m(\d+)$/);
      if (!parsed) continue;
      await admin
        .from("matches")
        .update({ provider_match_id: b.provider_match_id })
        .eq("tournament_id", event.id)
        .eq("round", Number(parsed[1]))
        .eq("index_in_round", Number(parsed[2]))
        .is("provider_match_id", null);
    }
  }

  const liveMapped = mapLiveFinishedToIngest(
    liveEvents.filter((row) => {
      const rec =
        row && typeof row === "object"
          ? (row as { matchId?: string })
          : {};
      return (
        String(rec.matchId || "").split("-")[2] === String(event.provider_id)
      );
    }),
    mapping
  );

  // Merge: pair-bound wins, then id-mapped, then live.
  const byKey = new Map<
    string,
    {
      match_key: string;
      winner_provider_id?: string | null;
      winner_ref: string | null;
      voided: boolean;
      provider_match_id?: string;
    }
  >();
  for (const r of mapped.results) {
    byKey.set(r.match_key, {
      match_key: r.match_key,
      winner_ref: r.winner_ref,
      winner_provider_id: r.winner_ref,
      voided: r.voided,
    });
  }
  for (const r of bound.results) {
    byKey.set(r.match_key, {
      match_key: r.match_key,
      winner_ref: r.winner_ref,
      winner_provider_id: r.winner_provider_id,
      voided: r.voided,
      provider_match_id: r.provider_match_id,
    });
  }
  for (const r of liveMapped.results) {
    if (!byKey.has(r.match_key)) {
      byKey.set(r.match_key, {
        match_key: r.match_key,
        winner_ref: r.winner_ref,
        winner_provider_id: r.winner_ref,
        voided: r.voided,
      });
    }
  }

  // Provider-authoritative: fixtures present remotely but unbound → audit (never silent).
  const knownPm = new Set(Object.keys(maps.matches || {}));
  for (const m of matchSides) {
    if (m.provider_match_id) knownPm.add(String(m.provider_match_id));
  }
  const unbound = unboundProviderFixtures(
    singles ?? [],
    [
      ...bound.results.map((r) => ({
        match_key: r.match_key,
        provider_match_id: r.provider_match_id,
      })),
      ...bound.bindings.map((b) => ({
        match_key: b.match_key,
        provider_match_id: b.provider_match_id,
      })),
    ],
    knownPm
  );
  const authDiff = diffProviderAuthoritative(
    singles ?? [],
    matchSides.map((m) => ({
      id: m.match_key,
      provider_match_id: m.provider_match_id,
      match_key: m.match_key,
    }))
  );

  log.push(
    `${event.slug} results bound=${bound.results.length} mapped=${mapped.results.length} live=${liveMapped.results.length} unbound=${unbound.length} orphans=${authDiff.orphans.length}`
  );

  // Shape B: create/fill missing R0 matches from results archive + official seats.
  const seats = await loadSeatProviders(admin, event.id);
  const shapeB = proposeShapeBRepairs(unbound, seats, matchSides);
  const shapeBIngest = await applyShapeBRepairs(
    admin,
    event,
    shapeB,
    env.dryRun,
    log
  );
  for (const r of shapeBIngest) {
    byKey.set(r.match_key, {
      match_key: r.match_key,
      winner_ref: r.winner_ref,
      winner_provider_id: r.winner_provider_id,
      voided: r.voided,
      provider_match_id: r.provider_match_id,
    });
  }
  if (shapeB.length) {
    log.push(
      `${event.slug} shapeB proposed=${shapeB.length} ingest=${shapeBIngest.length}`
    );
  }

  const results = [...byKey.values()];

  // EventMapper for active R0/live-capable matches (REST trigger only).
  await refreshEventMap(admin, rapid, event, matchSides, liveEvents, log);

  if (!results.length || env.dryRun) {
    if (!env.dryRun && (unbound.length || authDiff.orphans.length)) {
      await admin.from("ops_events").insert({
        kind: "reconcile",
        name: "provider_authoritative_gap",
        payload: {
          tournament_id: event.id,
          slug: event.slug,
          unbound: unbound.slice(0, 40),
          orphans: authDiff.orphans.slice(0, 40),
          missing_from_store: authDiff.missingFromStore.slice(0, 40),
        },
      });
    }
    return { ingested: 0 };
  }

  const { data: runRow, error: runErr } = await admin
    .from("sync_repair_runs")
    .insert({
      kind: "reconcile",
      tournament_id: event.id,
      status: "running",
      summary: {
        slug: event.slug,
        unbound: unbound.length,
        orphans: authDiff.orphans.length,
      },
    })
    .select("id")
    .maybeSingle();
  if (runErr) log.push(`repair run: ${runErr.message}`);
  const runId = runRow?.id ? String(runRow.id) : null;

  if (runId && authDiff.orphans.length) {
    for (const orphan of authDiff.orphans.slice(0, 100)) {
      await admin.from("sync_repairs").insert({
        run_id: runId,
        tournament_id: event.id,
        match_key: orphan.match_key,
        provider_match_id: orphan.provider_match_id,
        before: orphan,
        after: null,
        note: "orphan_flagged",
      });
    }
  }
  if (runId && unbound.length) {
    await admin.from("sync_repairs").insert({
      run_id: runId,
      tournament_id: event.id,
      match_key: null,
      provider_match_id: null,
      before: null,
      after: { unbound: unbound.slice(0, 50) },
      note: "unbound_provider_fixtures",
    });
  }

  const result = await applyMatchResults(admin, event.id, results, log, {
    runId,
  });
  if (runId) {
    await admin
      .from("sync_repair_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: result.ok ? "ok" : "error",
        summary: {
          slug: event.slug,
          updated: result.ok ? result.updated : 0,
          advanced: result.ok ? result.advanced : 0,
          unbound: unbound.length,
          orphans: authDiff.orphans.length,
          error: result.ok ? null : result.error,
        },
      })
      .eq("id", runId);
  }
  if (!result.ok) {
    log.push(`ingest-events failed: ${result.error}`);
    throw new Error(`ingest-events failed: ${result.error}`);
  }
  log.push(
    `ingest-events ok updated=${result.updated} advanced=${result.advanced ?? 0} skipped=${result.skipped.length} run=${runId ?? "none"}`
  );
  return { ingested: results.length };
}

async function refreshEventMap(
  admin: ReturnType<typeof createClient>,
  rapid: ReturnType<typeof createRapid>,
  event: SyncedEvent,
  matchSides: Awaited<ReturnType<typeof loadMatchSides>>,
  liveEvents: unknown[],
  log: string[]
) {
  let mapped = 0;
  let missed = 0;
  for (const m of matchSides) {
    if (m.round > 2) continue; // focus near-term rounds
    if (!m.side_a_provider_id || !m.side_b_provider_id) continue;
    try {
      const resolved = await resolveLiveEvent(
        {
          player1Id: m.side_a_provider_id,
          player2Id: m.side_b_provider_id,
          providerTournamentId: event.provider_id,
        },
        liveEvents,
        // Prefer live list; event/get only when no live hit (rate-limit safe).
        liveEvents.length === 0
          ? { eventGet: (q) => getExtendEvent(rapid, q) }
          : {}
      );
      await admin.from("event_map").upsert(
        {
          tournament_id: event.id,
          match_id: m.match_id,
          pair_key: resolved.pair_key,
          socket_event_id: resolved.socket_event_id,
          status: resolved.status,
          confidence: resolved.confidence,
          method: resolved.method,
          mapped_at: new Date().toISOString(),
          expires_at: resolved.expires_at,
        },
        { onConflict: "tournament_id,pair_key" }
      );
      if (resolved.status === "mapped") mapped += 1;
      else missed += 1;
    } catch (err) {
      missed += 1;
      log.push(
        `evmap ${m.match_key}: ${err instanceof Error ? err.message : err}`
      );
    }
  }
  if (mapped || missed) {
    log.push(`${event.slug} event_map mapped=${mapped} miss=${missed}`);
  }
}
