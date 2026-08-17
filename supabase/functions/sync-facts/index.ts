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
import { applyDrawFacts, type ApplyDrawBody } from "../_shared/apply-draw.ts";
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
  } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const dryRun = Boolean(body.dryRun);
  const force = Boolean(body.force);
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
  surface?: string;
  type?: string;
  category?: string;
};

type SyncedEvent = {
  id: string;
  slug: string;
  name: string;
  tour: "atp" | "wta";
  provider_id: string;
  draw_size: number;
  starts_on: string | null;
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
    const { error } = await admin.from("tournaments").upsert(
      filtered.map((t) => ({
        slug: t.slug,
        name: t.name,
        tour: t.tour,
        surface: t.surface,
        starts_on: t.starts_on,
        ends_on: t.ends_on,
        provider_id: t.provider_id,
        draw_size: t.draw_size,
      })),
      { onConflict: "provider_id" }
    );
    if (error) {
      // provider_id unique; also try slug conflict path for older rows
      const { error: err2 } = await admin.from("tournaments").upsert(
        filtered.map((t) => ({
          slug: t.slug,
          name: t.name,
          tour: t.tour,
          surface: t.surface,
          starts_on: t.starts_on,
          ends_on: t.ends_on,
          provider_id: t.provider_id,
          draw_size: t.draw_size,
        })),
        { onConflict: "slug" }
      );
      if (err2) throw new Error(`tournaments upsert: ${err2.message}`);
    }
    upserted = filtered.length;
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
  const blob = `${name} ${row?.type ?? ""} ${row?.category ?? ""}`.toLowerCase();
  if (/\bdoubles\b/.test(blob) && !/\bsingles\b/.test(blob)) return null;

  const starts =
    String(row.date || row.start || "").slice(0, 10) || `${year}-01-01`;
  const ends =
    String(row.endDate || row.end || row.date || row.start || "").slice(0, 10) ||
    starts;

  const surface = normalizeSurface(row.surface);
  const drawSize = inferDrawSizeHint(name, blob);

  return {
    slug: `t-${tour}-${providerId}`,
    name,
    tour,
    surface,
    starts_on: starts,
    ends_on: ends,
    provider_id: providerId,
    ...(drawSize ? { draw_size: drawSize } : {}),
  };
}

function normalizeSurface(raw: unknown): string {
  const s = String(raw || "").toLowerCase();
  if (s.includes("clay")) return "clay";
  if (s.includes("grass")) return "grass";
  if (s.includes("carpet") || s.includes("indoor")) return "indoor";
  return "hard";
}

/** Soft hint only — official publish overwrites from the sheet. */
function inferDrawSizeHint(name: string, blob: string): number | null {
  if (/us open|roland|australian|wimbledon/.test(blob)) return 128;
  if (/masters|1000|cincinnati|indian wells|miami|madrid|rome|shanghai|paris|montreal|toronto|canada/.test(
    blob
  )) {
    return 128;
  }
  if (/500|250|challenger/.test(blob)) return 32;
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

async function listSyncedEvents(
  admin: ReturnType<typeof createClient>,
  onlySlug: string | null
): Promise<SyncedEvent[]> {
  const { data, error } = await admin
    .from("tournaments")
    .select("id, slug, name, tour, draw_size, provider_id, starts_on")
    .not("provider_id", "is", null);
  if (error) throw new Error(error.message);

  const now = Date.now();
  let events = (data ?? [])
    .filter((row) => row?.slug && row.provider_id)
    .map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      tour: (row.tour === "wta" ? "wta" : "atp") as "atp" | "wta",
      provider_id: String(row.provider_id),
      draw_size: Number(row.draw_size) || 0,
      starts_on: (row.starts_on as string) ?? null,
      ref: row.slug as string,
      api_name: row.name as string,
    }))
    .filter((e) => inWindow(e.starts_on, now) || onlySlug === e.slug);

  if (onlySlug) events = events.filter((e) => e.slug === onlySlug);
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
  const result = await applyDrawFacts(admin, body as ApplyDrawBody, log);
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

  const official = await resolveOfficialSeats(rapid, event, fixtures);
  if (!official.ok) {
    log.push(
      `${label} pending — ${official.reason}${
        official.firstRound ? ` (${official.firstRound})` : ""
      }`
    );
    return { status: matchups.length ? "announced" : "pending" };
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
  if (Object.keys(maps.matches).length === 0) {
    log.push(`${event.slug} no match map yet`);
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

  const mapped = mapResultsToIngest(singles ?? [], mapping);
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

  const results = [...mapped.results, ...liveMapped.results].map((r) => ({
    match_key: r.match_key,
    winner_provider_id: r.winner_ref,
    winner_ref: r.winner_ref,
    voided: r.voided,
  }));

  log.push(
    `${event.slug} results mapped=${mapped.results.length} live=${liveMapped.results.length}`
  );

  if (!results.length || env.dryRun) {
    return { ingested: 0 };
  }

  const result = await applyMatchResults(admin, event.id, results, log);
  if (!result.ok) {
    log.push(`ingest-events failed: ${result.error}`);
    throw new Error(`ingest-events failed: ${result.error}`);
  }
  log.push(
    `ingest-events ok updated=${result.updated} skipped=${result.skipped.length}`
  );
  return { ingested: results.length };
}
