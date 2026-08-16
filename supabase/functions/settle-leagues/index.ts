// supabase/functions/settle-leagues
// Grade submitted brackets after official results exist.
// Auth: Authorization: Bearer <INGEST_SECRET>
//
// POST { "tournament_ref"?: "cin-2026" }
// Omit ref to settle tournaments with finished matches that still need a
// grading pass (new/updated results since last snapshot). Prefer calling
// with tournament_ref right after ingest when a scheduled match is done.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  gradeBracket,
  maxBracketScore,
  rankRows,
  seasonPoints,
} from "../_shared/core.js";

type BracketPicks = Record<string, string>;
type OfficialResults = Record<
  string,
  { winnerRef: string | null; voided?: boolean }
>;

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

  let body: { tournament_ref?: string; dryRun?: boolean } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const log: string[] = [];

  try {
    const refs = body.tournament_ref?.trim()
      ? [body.tournament_ref.trim()]
      : await listSettleRefs(admin);
    const summary = { tournaments: refs.length, graded: 0, skipped: 0, errors: 0 };
    for (const ref of refs) {
      try {
        const result = await settleTournament(admin, ref, Boolean(body.dryRun), log);
        summary.graded += result.graded;
        summary.skipped += result.skipped;
      } catch (err) {
        summary.errors += 1;
        log.push(
          `${ref} settle error: ${err instanceof Error ? err.message : err}`
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

async function listSettleRefs(admin: ReturnType<typeof createClient>) {
  // Cron safety net: only tournaments whose official results are newer than
  // the last graded snapshot (or never graded). Explicit tournament_ref
  // bypasses this filter.
  const { data: results, error } = await admin
    .from("match_results")
    .select("tournament_id, match_key, settled_at");
  if (error) throw new Error(error.message);
  if (!results?.length) return [];

  const byTour = new Map<string, { latest: string; keys: string[] }>();
  for (const row of results) {
    const tid = String(row.tournament_id);
    const at = String(row.settled_at || "");
    const prev = byTour.get(tid);
    if (!prev) {
      byTour.set(tid, { latest: at, keys: [String(row.match_key)] });
    } else {
      if (at > prev.latest) prev.latest = at;
      prev.keys.push(String(row.match_key));
    }
  }
  const ids = [...byTour.keys()];
  const now = Date.now();

  const { data: schedule, error: sErr } = await admin
    .from("match_schedule")
    .select("tournament_id, match_key, scheduled_at, has_time")
    .in("tournament_id", ids);
  if (sErr) throw new Error(sErr.message);

  const scheduleByKey = new Map<string, { scheduled_at: string; has_time: boolean }>();
  for (const row of schedule ?? []) {
    scheduleByKey.set(`${row.tournament_id}:${row.match_key}`, {
      scheduled_at: String(row.scheduled_at),
      has_time: Boolean(row.has_time),
    });
  }

  const dueIds: string[] = [];
  for (const [tid, info] of byTour) {
    // Due when at least one finished match has reached its timed start
    // (or has no timed schedule — date-only / unscheduled still settle).
    const due = info.keys.some((key) => {
      const sch = scheduleByKey.get(`${tid}:${key}`);
      if (!sch || !sch.has_time) return true;
      const t = Date.parse(sch.scheduled_at);
      return !Number.isNaN(t) && t <= now;
    });
    if (due) dueIds.push(tid);
  }
  if (dueIds.length === 0) return [];

  const { data: snaps, error: snapErr } = await admin
    .from("bracket_snapshots")
    .select("tournament_id, ranked_at")
    .in("tournament_id", dueIds);
  if (snapErr) throw new Error(snapErr.message);
  const latestSnap = new Map<string, string>();
  for (const row of snaps ?? []) {
    const tid = String(row.tournament_id);
    const at = String(row.ranked_at || "");
    const prev = latestSnap.get(tid);
    if (!prev || at > prev) latestSnap.set(tid, at);
  }

  const needGrade = dueIds.filter((tid) => {
    const latestResult = byTour.get(tid)?.latest ?? "";
    const snapAt = latestSnap.get(tid);
    return !snapAt || latestResult > snapAt;
  });
  if (needGrade.length === 0) return [];

  const { data: tours, error: tErr } = await admin
    .from("tournaments")
    .select("ref")
    .in("id", needGrade);
  if (tErr) throw new Error(tErr.message);
  return (tours ?? []).map((t) => String(t.ref)).filter(Boolean);
}

async function settleTournament(
  admin: ReturnType<typeof createClient>,
  ref: string,
  dryRun: boolean,
  log: string[]
) {
  const { data: tournament, error: tErr } = await admin
    .from("tournaments")
    .select("id, ref, draw_size")
    .eq("ref", ref)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!tournament?.id) {
    log.push(`${ref} not found`);
    return { graded: 0, skipped: 1 };
  }

  const { data: resultRows, error: rErr } = await admin
    .from("match_results")
    .select("match_key, winner_ref, voided")
    .eq("tournament_id", tournament.id);
  if (rErr) throw new Error(rErr.message);
  if (!resultRows?.length) {
    log.push(`${ref} no official results`);
    return { graded: 0, skipped: 1 };
  }

  const official: OfficialResults = {};
  for (const row of resultRows) {
    official[row.match_key] = {
      winnerRef: row.winner_ref,
      voided: row.voided,
    };
  }

  const { data: bracketRows, error: bErr } = await admin
    .from("brackets")
    .select("league_id")
    .eq("tournament_id", tournament.id)
    .not("submitted_at", "is", null);
  if (bErr) throw new Error(bErr.message);
  const leagueIds = [...new Set((bracketRows ?? []).map((r) => r.league_id))];
  if (leagueIds.length === 0) {
    log.push(`${ref} no submitted brackets`);
    return { graded: 0, skipped: 1 };
  }

  if (dryRun) {
    log.push(`${ref} dry-run leagues=${leagueIds.length}`);
    return { graded: 0, skipped: 0 };
  }

  const { data: leagues, error: lErr } = await admin
    .from("leagues")
    .select("id, slug")
    .in("id", leagueIds);
  if (lErr) throw new Error(lErr.message);

  let graded = 0;
  for (const league of leagues ?? []) {
    graded += await settleLeague(
      admin,
      {
        leagueId: league.id,
        tournamentId: tournament.id,
        drawSize: Number(tournament.draw_size) || 64,
      },
      official
    );
  }
  log.push(`${ref} graded=${graded} leagues=${leagueIds.length}`);
  return { graded, skipped: 0 };
}

async function settleLeague(
  admin: ReturnType<typeof createClient>,
  input: { leagueId: string; tournamentId: string; drawSize: number },
  official: OfficialResults
) {
  const { data: brackets, error } = await admin
    .from("brackets")
    .select("id, user_id, picks")
    .eq("league_id", input.leagueId)
    .eq("tournament_id", input.tournamentId)
    .not("submitted_at", "is", null);
  if (error) throw new Error(error.message);

  const { data: priorSnaps } = await admin
    .from("bracket_snapshots")
    .select("user_id, position, score")
    .eq("league_id", input.leagueId)
    .eq("tournament_id", input.tournamentId);

  const priorByUser = new Map(
    (priorSnaps ?? []).map((s) => [
      s.user_id as string,
      { position: s.position as number | null, score: s.score as number },
    ])
  );

  const maxScore = maxBracketScore(input.drawSize);
  const weight = 2;
  const graded = (brackets ?? []).map((b) => {
    const grade = gradeBracket({
      drawSize: input.drawSize,
      picks: (b.picks ?? {}) as BracketPicks,
      official,
    });
    return {
      userId: b.user_id as string,
      bracketId: b.id as string,
      score: grade.score,
      correct: grade.correct,
      incorrect: grade.incorrect,
      voided: grade.voided,
      upside: grade.upside,
      championRef: grade.championRef,
      championAlive: grade.championAlive,
      tieBreak: b.user_id as string,
    };
  });

  const ranked = rankRows(graded);
  const now = new Date().toISOString();
  for (const row of ranked) {
    const prior = priorByUser.get(row.userId);
    const { error: upErr } = await admin.from("bracket_snapshots").upsert(
      {
        league_id: input.leagueId,
        tournament_id: input.tournamentId,
        user_id: row.userId,
        bracket_id: row.bracketId,
        score: row.score,
        correct: row.correct,
        incorrect: row.incorrect,
        voided_picks: row.voided,
        upside: row.upside,
        max_score: maxScore,
        champion_ref: row.championRef,
        champion_alive: row.championAlive,
        position: row.position,
        previous_position: prior?.position ?? null,
        score_delta: prior?.score != null ? row.score - prior.score : null,
        position_delta:
          prior?.position != null ? prior.position - row.position : null,
        ranked_at: now,
      },
      { onConflict: "league_id,tournament_id,user_id" }
    );
    if (upErr) throw new Error(upErr.message);
  }

  await recomputeSeason(admin, input.leagueId, weight);
  return ranked.length;
}

async function recomputeSeason(
  admin: ReturnType<typeof createClient>,
  leagueId: string,
  defaultWeight: number
) {
  const { data: snaps, error } = await admin
    .from("bracket_snapshots")
    .select("user_id, score, max_score")
    .eq("league_id", leagueId);
  if (error) throw new Error(error.message);

  const { data: priorSeason } = await admin
    .from("season_standings")
    .select("user_id, position, points")
    .eq("league_id", leagueId);
  const prior = new Map(
    (priorSeason ?? []).map((r) => [
      r.user_id as string,
      { position: r.position as number | null, points: r.points as number },
    ])
  );

  const byUser = new Map<string, number>();
  for (const s of snaps ?? []) {
    const pts = seasonPoints(s.score, s.max_score || 1, defaultWeight);
    byUser.set(s.user_id, (byUser.get(s.user_id) ?? 0) + pts);
  }
  const ranked = rankRows(
    [...byUser.entries()].map(([userId, score]) => ({
      userId,
      score,
      tieBreak: userId,
    }))
  );
  const now = new Date().toISOString();
  for (const row of ranked) {
    const prev = prior.get(row.userId);
    const { error: upErr } = await admin.from("season_standings").upsert(
      {
        league_id: leagueId,
        user_id: row.userId,
        points: row.score,
        position: row.position,
        previous_position: prev?.position ?? null,
        points_delta: prev != null ? row.score - prev.points : null,
        updated_at: now,
      },
      { onConflict: "league_id,user_id" }
    );
    if (upErr) throw new Error(upErr.message);
  }
}
