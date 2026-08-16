// supabase/functions/rebuild-draw
// One-shot / ops: wipe + replace draw seats for a live-feed tournament.
// Auth: Authorization: Bearer <INGEST_SECRET>
//
// Secrets: INGEST_SECRET, SUPABASE_SERVICE_ROLE_KEY (auto), SUPABASE_URL (auto)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SEASON } from "../_shared/season.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SeatRow = {
  position: number;
  player_ref: string;
  last_name: string;
  seed: number | null;
  country_code: string;
  is_bye: boolean;
  seat_kind?: "player" | "bye" | "tbd";
  entry_status?: "wc" | "pr" | null;
  provider_player_id?: string | null;
};

function seatKindOf(s: SeatRow): "player" | "bye" | "tbd" {
  if (s.seat_kind) return s.seat_kind;
  return s.is_bye ? "bye" : "player";
}

type ResultRow = {
  match_key: string;
  winner_ref: string | null;
  voided?: boolean;
};

type ScheduleRow = {
  match_key: string;
  scheduled_at: string;
  has_time?: boolean;
};

type MatchupRow = {
  provider_match_id: string;
  match_key: string;
  player1_ref: string;
  player1_last_name: string;
  player1_country?: string;
  player1_seed?: number | null;
  player2_ref: string;
  player2_last_name: string;
  player2_country?: string;
  player2_seed?: number | null;
  scheduled_at?: string | null;
  has_time?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const secret = Deno.env.get("INGEST_SECRET");
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!secret || token !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: {
    tournament_id?: string;
    tournament_ref?: string;
    tournament_patch?: {
      name?: string;
      draw_size?: number;
      provider_tournament_id?: string;
      tour?: "atp" | "wta";
      surface?: string;
      starts_on?: string;
      lock_at?: string;
    };
    /** Replace an existing verified draw. Default: skip if verified seats exist. */
    force?: boolean;
    /** Delete all announced_matchups for this tournament before upsert (or alone). */
    replace_announced?: boolean;
    delete_tournament_refs?: string[];
    seats?: SeatRow[];
    results?: ResultRow[];
    schedule?: ScheduleRow[];
    matchups?: MatchupRow[];
    /** provider match id → MatchRead match_key (r0-m0). */
    matches?: Record<string, string>;
    /** When set, retarget leagues from these old fixture labels to tournament_patch.name. */
    montreal_name_labels?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const seats = body.seats ?? [];
  const matchups = (body.matchups ?? []).filter(
    (m) =>
      m.provider_match_id &&
      m.match_key &&
      m.player1_ref &&
      m.player1_last_name &&
      m.player2_ref &&
      m.player2_last_name
  );
  if (seats.length === 0 && matchups.length === 0) {
    return new Response(
      JSON.stringify({ error: "seats[] or matchups[] required" }),
      {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const log: string[] = [];

  let tournamentId = body.tournament_id?.trim() || "";
  const tournamentRef = body.tournament_ref?.trim() || "";
  if (!tournamentId && tournamentRef) {
    const { data: tRow, error: tErr } = await admin
      .from("tournaments")
      .select("id")
      .eq("ref", tournamentRef)
      .maybeSingle();
    if (tErr) return jsonError(400, tErr.message, log);
    if (!tRow?.id) {
      return jsonError(400, `tournament not found for ref ${tournamentRef}`, log);
    }
    tournamentId = tRow.id;
    log.push(`resolved ref ${tournamentRef} → ${tournamentId}`);
  }
  if (!tournamentId) {
    return new Response(
      JSON.stringify({ error: "tournament_id or tournament_ref required" }),
      {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  }

  if (seats.length > 0) {
    const expected = SEASON.find((s) => s.ref === tournamentRef)?.draw_size;
    if (expected && seats.length !== expected) {
      return jsonError(
        400,
        `${tournamentRef} rejects ${seats.length}-draw (need ${expected} singles)`,
        log
      );
    }
  }

  // Retarget leagues that pointed at deleted fixture names (ATP migration only).
  const labels = body.montreal_name_labels ?? [];
  if (labels.length > 0) {
    const targetName =
      body.tournament_patch?.name ?? "National Bank Open Montreal 2026";
    for (const label of labels) {
      const { error, count } = await admin
        .from("leagues")
        .update({ tournament_label: targetName })
        .eq("tournament_label", label);
      if (error) {
        return jsonError(400, error.message, log);
      }
      log.push(`retargeted leagues from ${label} (count≈${count ?? "?"})`);
    }
  }

  if (matchups.length > 0 || body.replace_announced) {
    // Replace the announced sheet so stale fx / doubles rows cannot linger.
    const { error: annDelErr } = await admin
      .from("announced_matchups")
      .delete()
      .eq("tournament_id", tournamentId);
    if (annDelErr) {
      return jsonError(400, `wipe announced: ${annDelErr.message}`, log);
    }
    log.push("wiped announced_matchups");
  }

  if (matchups.length > 0) {
    const now = new Date().toISOString();
    const rows = matchups.map((m) => ({
      tournament_id: tournamentId,
      provider_match_id: String(m.provider_match_id),
      match_key: m.match_key,
      player1_ref: m.player1_ref,
      player1_last_name: m.player1_last_name,
      player1_country: (m.player1_country || "XXX").slice(0, 3).toUpperCase(),
      player1_seed: m.player1_seed ?? null,
      player2_ref: m.player2_ref,
      player2_last_name: m.player2_last_name,
      player2_country: (m.player2_country || "XXX").slice(0, 3).toUpperCase(),
      player2_seed: m.player2_seed ?? null,
      scheduled_at: m.scheduled_at || null,
      has_time: Boolean(m.has_time),
      updated_at: now,
    }));
    const { error } = await admin.from("announced_matchups").upsert(rows, {
      onConflict: "tournament_id,provider_match_id",
    });
    if (error) return jsonError(400, `matchups: ${error.message}`, log);
    log.push(`upserted ${rows.length} announced_matchups`);
  }

  if (seats.length === 0) {
    return new Response(
      JSON.stringify({
        ok: true,
        tournament_id: tournamentId,
        matchups: matchups.length,
        log,
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  }

  // Never wipe a verified public draw unless the caller opts in.
  // Same-size official sheets may overlay provider ids (better field, same slots).
  if (!body.force) {
    const { data: existingDraw, error: existingErr } = await admin
      .from("draws")
      .select("id")
      .eq("tournament_id", tournamentId)
      .limit(1)
      .maybeSingle();
    if (existingErr) return jsonError(400, existingErr, log);
    if (existingDraw?.id) {
      log.push(`existing draw ${existingDraw.id}`);
      const { data: tRow, error: tSizeErr } = await admin
        .from("tournaments")
        .select("id, ref, draw_size")
        .eq("id", tournamentId)
        .maybeSingle();
      if (tSizeErr) {
        log.push("tournament select failed");
        return jsonError(400, tSizeErr, log);
      }
      log.push(`tournament ref=${tRow?.ref} draw_size=${tRow?.draw_size}`);
      const { data: seatRows, error: seatCountErr } = await admin
        .from("draw_seats")
        .select("position")
        .eq("draw_id", existingDraw.id);
      if (seatCountErr) {
        log.push("seat select failed");
        return jsonError(400, seatCountErr, log);
      }
      const existingCount = seatRows?.length ?? 0;
      const officialSize = Number(tRow?.draw_size) || 0;
      log.push(`seats existing=${existingCount} officialSize=${officialSize} incoming=${seats.length}`);
      if (existingCount > 0 && existingCount === officialSize) {
        if (seats.length === existingCount) {
          const { data: currentSeats, error: curErr } = await admin
            .from("draw_seats")
            .select("position, seat_kind, last_name, is_bye")
            .eq("draw_id", existingDraw.id);
          if (curErr) return jsonError(400, curErr, log);
          const currentByPos = new Map(
            (currentSeats ?? []).map((s) => [Number(s.position), s])
          );
          let mapped = 0;
          let filled = 0;
          for (const s of seats) {
            const existing = currentByPos.get(Number(s.position));
            const patch: Record<string, unknown> = {};
            if (s.provider_player_id) {
              patch.provider_player_id = s.provider_player_id;
              patch.country_code = s.country_code || "XXX";
              patch.seed = s.seed ?? null;
            }
            const incomingKind = seatKindOf(s);
            const existingIsTbd =
              existing?.seat_kind === "tbd" ||
              /^qualifier$/i.test(String(existing?.last_name || ""));
            if (
              existingIsTbd &&
              incomingKind === "player" &&
              s.last_name &&
              !/^qualifier$/i.test(String(s.last_name))
            ) {
              patch.last_name = s.last_name;
              patch.seat_kind = "player";
              patch.is_bye = false;
              if (s.player_ref) patch.player_ref = s.player_ref;
              if (s.entry_status) patch.entry_status = s.entry_status;
              filled += 1;
            }
            if (Object.keys(patch).length === 0) continue;
            const { error: upErr } = await admin
              .from("draw_seats")
              .update(patch)
              .eq("draw_id", existingDraw.id)
              .eq("position", s.position);
            if (upErr) return jsonError(400, upErr, log);
            mapped += 1;
          }
          log.push(
            `kept official ${existingCount}-draw; overlaid ${mapped} seats; filled ${filled} TBD`
          );
          const facts = await applyResultsScheduleAndLock(
            admin,
            tournamentId,
            body.results,
            body.schedule,
            log
          );
          if (facts.error) return jsonError(400, facts.error, log);
          const mapErr = await upsertMatchMap(
            admin,
            tournamentId,
            body.matches,
            log
          );
          if (mapErr) return jsonError(400, mapErr, log);
          return new Response(
            JSON.stringify({
              ok: true,
              skipped: "verified_draw_exists",
              overlaid: mapped,
              filled,
              tournament_id: tournamentId,
              draw_id: existingDraw.id,
              seats: existingCount,
              results: facts.results,
              schedule: facts.schedule,
              lock_at: facts.lockAt,
              log,
            }),
            {
              status: 200,
              headers: { ...cors, "Content-Type": "application/json" },
            }
          );
        }
        log.push(`skipped: verified draw already published (${existingCount} seats)`);
        return new Response(
          JSON.stringify({
            ok: true,
            skipped: "verified_draw_exists",
            tournament_id: tournamentId,
            draw_id: existingDraw.id,
            seats: existingCount,
            log,
          }),
          {
            status: 200,
            headers: { ...cors, "Content-Type": "application/json" },
          }
        );
      }
    }
  }

  // Delete fixture tournaments (cascade draws/seats).
  for (const ref of body.delete_tournament_refs ?? []) {
    const { error } = await admin.from("tournaments").delete().eq("ref", ref);
    if (error) return jsonError(400, `delete ${ref}: ${error.message}`, log);
    log.push(`deleted tournament ${ref}`);
  }

  // Wipe dependent rows for the live tournament.
  // Keep user picks unless this is an explicit force rebuild.
  const wipe = (
    body.force
      ? [
          "pick_voids",
          "bracket_snapshots",
          "brackets",
          "match_results",
          "provider_match_map",
        ]
      : ["match_results", "provider_match_map"]
  ) as const;
  for (const table of wipe) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq("tournament_id", tournamentId);
    if (error) return jsonError(400, `wipe ${table}: ${error.message}`, log);
    log.push(`wiped ${table}`);
  }

  let { data: draw, error: drawErr } = await admin
    .from("draws")
    .select("id")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (drawErr) return jsonError(400, drawErr.message, log);
  if (!draw?.id) {
    const { data: created, error: createErr } = await admin
      .from("draws")
      .insert({ tournament_id: tournamentId })
      .select("id")
      .single();
    if (createErr) return jsonError(400, createErr.message, log);
    draw = created;
    log.push("created draw");
  }

  const { error: seatDelErr } = await admin
    .from("draw_seats")
    .delete()
    .eq("draw_id", draw.id);
  if (seatDelErr) return jsonError(400, seatDelErr.message, log);
  log.push("wiped draw_seats");

  if (body.tournament_patch) {
    const { error } = await admin
      .from("tournaments")
      .update(body.tournament_patch)
      .eq("id", tournamentId);
    if (error) return jsonError(400, error.message, log);
    log.push("patched tournament");
  }

  const seatRows = seats.map((s) => {
    const kind = seatKindOf(s);
    return {
      draw_id: draw.id,
      position: s.position,
      player_ref: s.player_ref,
      last_name: s.last_name,
      seed: s.seed,
      country_code: s.country_code || "XXX",
      is_bye: kind === "bye",
      seat_kind: kind,
      entry_status: s.entry_status ?? null,
      provider_player_id: s.provider_player_id ?? null,
    };
  });

  const { error: seatInsErr } = await admin.from("draw_seats").insert(seatRows);
  if (seatInsErr) return jsonError(400, seatInsErr.message, log);
  log.push(`inserted ${seatRows.length} seats`);

  const facts = await applyResultsScheduleAndLock(
    admin,
    tournamentId,
    body.results,
    body.schedule,
    log
  );
  if (facts.error) return jsonError(400, facts.error, log);

  const mapErr = await upsertMatchMap(admin, tournamentId, body.matches, log);
  if (mapErr) return jsonError(400, mapErr, log);

  return new Response(
    JSON.stringify({
      ok: true,
      tournament_id: tournamentId,
      draw_id: draw.id,
      seats: seatRows.length,
      results: facts.results,
      schedule: facts.schedule,
      lock_at: facts.lockAt,
      log,
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    }
  );
});

function errText(err: unknown): string {
  if (err == null) return "unknown error";
  if (typeof err === "string") return err || "unknown error";
  if (typeof err === "object") {
    const e = err as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
      error?: string;
    };
    const parts = [e.code, e.message, e.details, e.hint, e.error].filter(
      (p) => typeof p === "string" && p.trim()
    );
    if (parts.length) return parts.join(" | ");
    try {
      const dumped = JSON.stringify(err);
      if (dumped && dumped !== "{}") return dumped;
    } catch {
      /* ignore */
    }
  }
  return String(err);
}

function jsonError(status: number, error: unknown, log: string[]) {
  return new Response(JSON.stringify({ error: errText(error), log }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function applyResultsScheduleAndLock(
  admin: ReturnType<typeof createClient>,
  tournamentId: string,
  results: ResultRow[] | undefined,
  schedule: ScheduleRow[] | undefined,
  log: string[]
): Promise<{
  error: string | null;
  results: number;
  schedule: number;
  lockAt: string | null;
}> {
  const resultRows = results ?? [];
  if (resultRows.length > 0) {
    const now = new Date().toISOString();
    const rows = resultRows.map((r) => ({
      tournament_id: tournamentId,
      match_key: r.match_key,
      winner_ref: r.voided ? null : r.winner_ref ?? null,
      voided: Boolean(r.voided),
      settled_at: now,
    }));
    const { error } = await admin.from("match_results").upsert(rows, {
      onConflict: "tournament_id,match_key",
    });
    if (error) return { error: `results: ${error.message}`, results: 0, schedule: 0, lockAt: null };
    log.push(`upserted ${rows.length} match_results`);
  }

  const scheduleRows = (schedule ?? []).filter((s) => s.match_key && s.scheduled_at);
  if (scheduleRows.length > 0) {
    const now = new Date().toISOString();
    const rows = scheduleRows.map((s) => ({
      tournament_id: tournamentId,
      match_key: s.match_key,
      scheduled_at: s.scheduled_at,
      has_time: Boolean(s.has_time),
      updated_at: now,
    }));
    const { error } = await admin.from("match_schedule").upsert(rows, {
      onConflict: "tournament_id,match_key",
    });
    if (error) {
      return { error: `schedule: ${error.message}`, results: resultRows.length, schedule: 0, lockAt: null };
    }
    log.push(`upserted ${rows.length} match_schedule`);
  }

  const { data: firstBall, error: lockErr } = await admin.rpc(
    "refresh_tournament_lock_from_schedule",
    { p_tournament_id: tournamentId }
  );
  if (lockErr) {
    return {
      error: `lock_at: ${lockErr.message}`,
      results: resultRows.length,
      schedule: scheduleRows.length,
      lockAt: null,
    };
  }
  if (firstBall) log.push(`lock_at ← first ball ${firstBall}`);
  else log.push("lock_at unchanged (no timed main-draw schedule)");

  return {
    error: null,
    results: resultRows.length,
    schedule: scheduleRows.length,
    lockAt: firstBall ?? null,
  };
}

async function upsertMatchMap(
  admin: ReturnType<typeof createClient>,
  tournamentId: string,
  matches: Record<string, string> | undefined,
  log: string[]
): Promise<string | null> {
  if (!matches || typeof matches !== "object") return null;
  const byMatchKey = new Map();
  for (const [provider_match_id, match_key] of Object.entries(matches)) {
    if (!provider_match_id || !match_key) continue;
    const id = String(provider_match_id);
    const key = String(match_key);
    const prev = byMatchKey.get(key);
    if (!prev || /^\d+$/.test(id)) byMatchKey.set(key, id);
  }
  const rows = [...byMatchKey.entries()].map(([match_key, provider_match_id]) => ({
    tournament_id: tournamentId,
    provider_match_id,
    match_key,
  }));
  if (rows.length === 0) return null;
  const { error } = await admin.from("provider_match_map").upsert(rows, {
    onConflict: "tournament_id,provider_match_id",
  });
  if (error) return `matches: ${error.message}`;
  log.push(`upserted ${rows.length} provider_match_map`);
  return null;
}
