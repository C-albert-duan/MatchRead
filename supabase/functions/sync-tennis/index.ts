// supabase/functions/sync-tennis
// Pull Tennis API facts. RAPIDAPI_KEY lives in Supabase secrets — not Vercel, not GitHub.
//
// POST /functions/v1/sync-tennis
// Authorization: Bearer <INGEST_SECRET>
// Body: { "job": "publish" | "reconcile" | "all", "dryRun"?: false, "ref"?: "cin-2026" }
//
// Deploy:
//   npx supabase secrets set RAPIDAPI_KEY=<key> INGEST_SECRET=<secret>
//   npx supabase functions deploy sync-tennis --no-verify-jwt
//
// Schedule: pg_cron every 5 min (migration 0025). GitHub workflow is manual only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createClient as createRapid,
  fetchOfficialSeats,
  getLiveEvents,
  getTournamentFixtures,
  getTournamentResults,
  mapLiveFinishedToIngest,
  mapResultsToIngest,
  namedFirstRoundPairs,
  overlayOfficialDraw,
} from "../_shared/rapidapi.js";
import { SEASON } from "../_shared/season.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Job = "publish" | "reconcile" | "all";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "POST required" }, 405);
  }

  const secret = Deno.env.get("INGEST_SECRET");
  const token = (req.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    ""
  ).trim();
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

  let body: { job?: string; dryRun?: boolean; ref?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const job = (body.job || "all") as Job;
  if (job !== "publish" && job !== "reconcile" && job !== "all") {
    return json({ error: "job must be publish | reconcile | all" }, 400);
  }

  const env = {
    RAPIDAPI_KEY: rapidKey,
    RAPIDAPI_HOST:
      Deno.env.get("RAPIDAPI_HOST") || "tennis-api-atp-wta-itf.p.rapidapi.com",
    INGEST_SECRET: secret,
    SUPABASE_URL: supabaseUrl,
    dryRun: Boolean(body.dryRun),
    onlyRef: body.ref?.trim() || null,
  };

  const admin = createClient(supabaseUrl, serviceKey);
  const rapid = createRapid({ key: env.RAPIDAPI_KEY, host: env.RAPIDAPI_HOST });
  const log: string[] = [];

  try {
    const out: Record<string, unknown> = { job, dryRun: env.dryRun };
    if (job === "publish" || job === "all") {
      out.publish = await runPublish(admin, rapid, env, log);
    }
    if (job === "reconcile" || job === "all") {
      out.reconcile = await runReconcile(admin, rapid, env, log);
    }
    if (!env.dryRun && (job === "reconcile" || job === "all")) {
      await postEdge(
        env,
        "settle-leagues",
        env.onlyRef ? { tournament_ref: env.onlyRef } : {},
        log
      );
    }
    return json({ ok: true, ...out, log });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`fatal: ${message}`);
    try {
      await admin.from("ops_events").insert({
        kind: "error",
        name: "sync_tennis",
        payload: { message: message.slice(0, 500) },
      });
    } catch {
      /* table may not exist yet */
    }
    return json({ ok: false, error: message, log }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function matchupsFromPairs(
  pairs: ReturnType<typeof namedFirstRoundPairs>,
  prefix: string
) {
  return pairs.map((p) => ({
    provider_match_id: String(p.id),
    match_key: `fx-${p.id}`,
    player1_ref: `${prefix}-${p.p1.id}`,
    player1_last_name: p.p1.last_name,
    player1_country: p.p1.country_code,
    player1_seed: p.p1.seed,
    player2_ref: `${prefix}-${p.p2.id}`,
    player2_last_name: p.p2.last_name,
    player2_country: p.p2.country_code,
    player2_seed: p.p2.seed,
    scheduled_at: p.instant?.scheduled_at ?? null,
    has_time: Boolean(p.instant?.has_time),
  }));
}

async function listEvents(
  admin: ReturnType<typeof createClient>,
  onlyRef: string | null
) {
  const byRef = new Map(
    SEASON.map((row) => [row.ref, { ...row, id: "", starts_on: null as string | null }])
  );
  const { data, error } = await admin
    .from("tournaments")
    .select("id, ref, name, tour, draw_size, provider_tournament_id, starts_on")
    .not("provider_tournament_id", "is", null);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    if (!row?.ref || !row.provider_tournament_id) continue;
    const prev = byRef.get(row.ref);
    byRef.set(row.ref, {
      id: row.id,
      ref: row.ref,
      name: row.name,
      api_name: prev?.api_name,
      tour: row.tour === "wta" ? "wta" : "atp",
      provider_tournament_id: String(row.provider_tournament_id),
          draw_size: prev?.draw_size || Number(row.draw_size) || 64,
      starts_on: row.starts_on ?? null,
    });
  }
  let events = [...byRef.values()];
  if (onlyRef) {
    return events.filter((e) => e.ref === onlyRef);
  }
  // Poll from 21 days after start through 45 days before start (US Open window).
  const now = Date.now();
  const day = 86_400_000;
  return events.filter((e) => {
    if (!e.starts_on) return true;
    const t = Date.parse(String(e.starts_on));
    if (Number.isNaN(t)) return true;
    return t >= now - 21 * day && t <= now + 45 * day;
  });
}

async function postEdge(
  env: { SUPABASE_URL: string; INGEST_SECRET: string; dryRun: boolean },
  name: "rebuild-draw" | "ingest-events" | "settle-leagues",
  payload: unknown,
  log: string[]
) {
  if (env.dryRun) {
    log.push(`${name} dry-run (not posted)`);
    return;
  }
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.INGEST_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  log.push(`${name} ${res.status} ${text.slice(0, 180)}`);
  if (!res.ok) throw new Error(`${name} failed: ${text.slice(0, 300)}`);
}

async function runPublish(
  admin: ReturnType<typeof createClient>,
  rapid: ReturnType<typeof createRapid>,
  env: {
    INGEST_SECRET: string;
    SUPABASE_URL: string;
    dryRun: boolean;
    onlyRef: string | null;
  },
  log: string[]
) {
  const events = await listEvents(admin, env.onlyRef);
  const summary = {
    announced: 0,
    published: 0,
    pending: 0,
    skipped: 0,
    errors: 0,
  };

  for (const event of events) {
    const label = `${event.ref}`;
    try {
      const { fixtures } = await getTournamentFixtures(
        rapid,
        event.tour as "atp" | "wta",
        event.provider_tournament_id
      );
      let archiveSingles: unknown[] = [];
      try {
        const archive = await getTournamentResults(
          rapid,
          event.tour as "atp" | "wta",
          event.provider_tournament_id
        );
        archiveSingles = archive.singles ?? [];
      } catch {
        archiveSingles = [];
      }
      const pairs = namedFirstRoundPairs(fixtures);
      const matchups = matchupsFromPairs(pairs, event.tour);

      if (matchups.length > 0) {
        await postEdge(
          env,
          "rebuild-draw",
          {
            tournament_ref: event.ref,
            tournament_patch: {
              provider_tournament_id: event.provider_tournament_id,
              tour: event.tour,
            },
            matchups,
          },
          log
        );
        summary.announced += 1;
      }

      const official = await fetchOfficialSeats(rapid, event);
      if (!official.ok) {
        log.push(`${label} pending — ${official.reason}`);
        summary.pending += 1;
        continue;
      }

      const built = overlayOfficialDraw(official.seats, fixtures, {
        prefix: event.tour,
        results: archiveSingles,
      });

      if (!built.ok) {
        log.push(`${label} pending — ${built.reason}`);
        summary.pending += 1;
        continue;
      }

      await postEdge(
        env,
        "rebuild-draw",
        {
          tournament_ref: event.ref,
          tournament_patch: {
            draw_size: built.drawSize,
            provider_tournament_id: event.provider_tournament_id,
            tour: event.tour,
          },
          seats: built.seats,
          results: built.results ?? [],
          schedule: built.schedule ?? [],
          matches: built.matches ?? {},
          matchups,
        },
        log
      );
      summary.published += 1;
      log.push(`${label} published ${built.drawSize}-draw`);
    } catch (err) {
      summary.errors += 1;
      log.push(`${label} publish error: ${err instanceof Error ? err.message : err}`);
    }
  }
  return summary;
}

async function runReconcile(
  admin: ReturnType<typeof createClient>,
  rapid: ReturnType<typeof createRapid>,
  env: {
    INGEST_SECRET: string;
    SUPABASE_URL: string;
    dryRun: boolean;
    onlyRef: string | null;
  },
  log: string[]
) {
  const events = (await listEvents(admin, env.onlyRef)).filter((e) => e.id);
  const summary = { events: events.length, ingested: 0, skipped: 0, errors: 0 };
  let liveEvents: unknown[] = [];
  try {
    const live = await getLiveEvents(rapid);
    liveEvents = live.events;
    log.push(`live events ${liveEvents.length}`);
  } catch (err) {
    log.push(`live events skipped: ${err instanceof Error ? err.message : err}`);
  }

  for (const event of events) {
    const label = event.ref;
    try {
      const { data: draw } = await admin
        .from("draws")
        .select("id")
        .eq("tournament_id", event.id)
        .maybeSingle();
      const players: Record<string, string> = {};
      if (draw?.id) {
        const { data: seats } = await admin
          .from("draw_seats")
          .select("player_ref, provider_player_id")
          .eq("draw_id", draw.id);
        for (const s of seats ?? []) {
          if (s.provider_player_id && s.player_ref) {
            players[String(s.provider_player_id)] = s.player_ref;
          }
        }
      }
      const { data: maps } = await admin
        .from("provider_match_map")
        .select("provider_match_id, match_key")
        .eq("tournament_id", event.id);
      const matches: Record<string, string> = {};
      for (const row of maps ?? []) {
        if (row.provider_match_id && row.match_key) {
          matches[String(row.provider_match_id)] = row.match_key;
        }
      }

      const { fixtures } = await getTournamentFixtures(
        rapid,
        event.tour as "atp" | "wta",
        event.provider_tournament_id
      );
      const { singles } = await getTournamentResults(
        rapid,
        event.tour as "atp" | "wta",
        event.provider_tournament_id
      );
      const official = await fetchOfficialSeats(rapid, event);
      if (official.ok) {
        const built = overlayOfficialDraw(official.seats, fixtures, {
          prefix: event.tour,
          results: singles,
        });
        if (built.ok) {
          Object.assign(players, built.players);
          Object.assign(matches, built.matches);
          await postEdge(
            env,
            "rebuild-draw",
            {
              tournament_ref: event.ref,
              seats: built.seats,
              matches: built.matches,
              results: built.results ?? [],
            },
            log
          );
        }
      }

      if (Object.keys(matches).length === 0) {
        log.push(`${label} no match map yet`);
        summary.skipped += 1;
        continue;
      }

      const mapping = {
        tournament_id: event.id,
        provider_tournament_id: event.provider_tournament_id,
        tour: event.tour as "atp" | "wta",
        players,
        matches,
      };
      const mapped = mapResultsToIngest(singles, mapping);
      const liveMapped = mapLiveFinishedToIngest(
        liveEvents.filter((row) => {
          const rec = row && typeof row === "object" ? (row as { matchId?: string }) : {};
          return String(rec.matchId || "").split("-")[2] === String(event.provider_tournament_id);
        }),
        mapping
      );
      const results = [...mapped.results, ...liveMapped.results];
      log.push(
        `${label} mapped=${mapped.results.length} live=${liveMapped.results.length} skipped=${mapped.skipped.length}`
      );
      if (!results.length) {
        summary.skipped += 1;
        continue;
      }
      await postEdge(
        env,
        "ingest-events",
        { tournament_id: event.id, results },
        log
      );
      summary.ingested += results.length;
    } catch (err) {
      summary.errors += 1;
      log.push(
        `${label} reconcile error: ${err instanceof Error ? err.message : err}`
      );
    }
  }
  return summary;
}
