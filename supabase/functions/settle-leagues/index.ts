// supabase/functions/settle-leagues
// Grade submitted brackets from picks + matches; write brackets.points/rank.
// Auth: Authorization: Bearer <INGEST_SECRET>
//
// POST { "tournament_slug"?: "cin-2026", "tournament_ref"?: "cin-2026" }
// Alias tournament_ref → slug. Omit to settle tournaments with new results.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { gradeBracket, matchKey, rankRows } from "../_shared/core.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  let body: {
    tournament_slug?: string;
    tournament_ref?: string;
    dryRun?: boolean;
  } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const log: string[] = [];

  try {
    const explicit =
      body.tournament_slug?.trim() || body.tournament_ref?.trim() || "";
    const slugs = explicit ? [explicit] : await listSettleSlugs(admin);
    const summary = {
      tournaments: slugs.length,
      graded: 0,
      skipped: 0,
      errors: 0,
    };
    for (const slug of slugs) {
      try {
        const result = await settleTournament(
          admin,
          slug,
          Boolean(body.dryRun),
          log
        );
        summary.graded += result.graded;
        summary.skipped += result.skipped;
      } catch (err) {
        summary.errors += 1;
        log.push(
          `${slug} settle error: ${err instanceof Error ? err.message : err}`
        );
      }
    }
    return json({ ok: true, ...summary, log });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message, log }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function listSettleSlugs(admin: ReturnType<typeof createClient>) {
  const { data: matches, error } = await admin
    .from("matches")
    .select("tournament_id, settled_at, scheduled_at, has_time")
    .not("settled_at", "is", null);
  if (error) throw new Error(error.message);
  if (!matches?.length) return [];

  const now = Date.now();
  const byTour = new Map<
    string,
    { latest: string; due: boolean }
  >();
  for (const row of matches) {
    const tid = String(row.tournament_id);
    const at = String(row.settled_at || "");
    const timed = Boolean(row.has_time) && row.scheduled_at;
    const due =
      !timed ||
      (!Number.isNaN(Date.parse(String(row.scheduled_at))) &&
        Date.parse(String(row.scheduled_at)) <= now);
    const prev = byTour.get(tid);
    if (!prev) {
      byTour.set(tid, { latest: at, due });
    } else {
      if (at > prev.latest) prev.latest = at;
      if (due) prev.due = true;
    }
  }

  const dueIds = [...byTour.entries()]
    .filter(([, info]) => info.due)
    .map(([tid]) => tid);
  if (dueIds.length === 0) return [];

  const { data: brackets, error: bErr } = await admin
    .from("brackets")
    .select("tournament_id, points, updated_at")
    .in("tournament_id", dueIds)
    .not("submitted_at", "is", null);
  if (bErr) throw new Error(bErr.message);

  const need = new Set<string>();
  for (const tid of dueIds) {
    const rows = (brackets ?? []).filter(
      (b) => String(b.tournament_id) === tid
    );
    if (rows.length === 0) continue;
    const latestResult = byTour.get(tid)?.latest ?? "";
    const ungraded = rows.some((b) => b.points == null);
    const stale = rows.some(
      (b) =>
        b.points != null &&
        latestResult &&
        String(b.updated_at || "") < latestResult
    );
    if (ungraded || stale) need.add(tid);
  }
  if (need.size === 0) return [];

  const { data: tours, error: tErr } = await admin
    .from("tournaments")
    .select("slug")
    .in("id", [...need]);
  if (tErr) throw new Error(tErr.message);
  return (tours ?? []).map((t) => String(t.slug)).filter(Boolean);
}

async function settleTournament(
  admin: ReturnType<typeof createClient>,
  slug: string,
  dryRun: boolean,
  log: string[]
) {
  const { data: tournament, error: tErr } = await admin
    .from("tournaments")
    .select("id, slug, draw_size")
    .eq("slug", slug)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!tournament?.id) {
    log.push(`${slug} not found`);
    return { graded: 0, skipped: 1 };
  }

  const drawSize = Number(tournament.draw_size) || 0;
  if (drawSize < 2) {
    log.push(`${slug} no draw_size`);
    return { graded: 0, skipped: 1 };
  }

  const { data: matchRows, error: mErr } = await admin
    .from("matches")
    .select(
      "id, round, index_in_round, winner_player_id, voided, settled_at"
    )
    .eq("tournament_id", tournament.id);
  if (mErr) throw new Error(mErr.message);

  const decided = (matchRows ?? []).filter(
    (m) => m.settled_at && (m.voided || m.winner_player_id)
  );
  if (decided.length === 0) {
    log.push(`${slug} no settled matches`);
    return { graded: 0, skipped: 1 };
  }

  const official: Record<
    string,
    { winnerPlayerId: string | null; voided?: boolean }
  > = {};
  const matchIdToKey = new Map<string, string>();
  for (const m of matchRows ?? []) {
    const key = matchKey(Number(m.round), Number(m.index_in_round));
    matchIdToKey.set(String(m.id), key);
    if (m.settled_at && (m.voided || m.winner_player_id)) {
      official[key] = {
        winnerPlayerId: m.voided ? null : (m.winner_player_id as string | null),
        voided: Boolean(m.voided),
      };
    }
  }

  const { data: bracketRows, error: bErr } = await admin
    .from("brackets")
    .select("id, league_id, user_id")
    .eq("tournament_id", tournament.id)
    .not("submitted_at", "is", null);
  if (bErr) throw new Error(bErr.message);
  if (!bracketRows?.length) {
    log.push(`${slug} no submitted brackets`);
    return { graded: 0, skipped: 1 };
  }

  if (dryRun) {
    log.push(`${slug} dry-run brackets=${bracketRows.length}`);
    return { graded: 0, skipped: 0 };
  }

  const byLeague = new Map<string, typeof bracketRows>();
  for (const b of bracketRows) {
    const lid = String(b.league_id);
    const list = byLeague.get(lid) ?? [];
    list.push(b);
    byLeague.set(lid, list);
  }

  let graded = 0;
  for (const [leagueId, leagueBrackets] of byLeague) {
    graded += await settleLeague(
      admin,
      {
        leagueId,
        tournamentId: tournament.id,
        drawSize,
        brackets: leagueBrackets,
        official,
        matchIdToKey,
      }
    );
  }
  log.push(`${slug} graded=${graded} leagues=${byLeague.size}`);
  return { graded, skipped: 0 };
}

async function settleLeague(
  admin: ReturnType<typeof createClient>,
  input: {
    leagueId: string;
    tournamentId: string;
    drawSize: number;
    brackets: { id: string; user_id: string; league_id: string }[];
    official: Record<
      string,
      { winnerPlayerId: string | null; voided?: boolean }
    >;
    matchIdToKey: Map<string, string>;
  }
) {
  const bracketIds = input.brackets.map((b) => b.id);
  const { data: pickRows, error: pErr } = await admin
    .from("picks")
    .select("bracket_id, match_id, player_id")
    .in("bracket_id", bracketIds);
  if (pErr) throw new Error(pErr.message);

  const picksByBracket = new Map<string, Record<string, string>>();
  for (const p of pickRows ?? []) {
    const key = input.matchIdToKey.get(String(p.match_id));
    if (!key) continue;
    const map = picksByBracket.get(String(p.bracket_id)) ?? {};
    map[key] = String(p.player_id);
    picksByBracket.set(String(p.bracket_id), map);
  }

  const graded = input.brackets.map((b) => {
    const grade = gradeBracket({
      drawSize: input.drawSize,
      picks: picksByBracket.get(b.id) ?? {},
      official: input.official,
    });
    return {
      userId: b.user_id,
      bracketId: b.id,
      score: grade.score,
      championPlayerId: grade.championPlayerId,
      tieBreak: b.user_id,
    };
  });

  const ranked = rankRows(graded);
  const now = new Date().toISOString();
  for (const row of ranked) {
    const { error: upErr } = await admin
      .from("brackets")
      .update({
        points: row.score,
        rank: row.position,
        champion_player_id: row.championPlayerId,
        updated_at: now,
      })
      .eq("id", row.bracketId);
    if (upErr) throw new Error(upErr.message);
  }

  return ranked.length;
}
