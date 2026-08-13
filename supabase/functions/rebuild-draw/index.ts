// supabase/functions/rebuild-draw
// One-shot / ops: wipe + replace draw seats for a live-feed tournament.
// Auth: Authorization: Bearer <INGEST_SECRET>
//
// Secrets: INGEST_SECRET, SUPABASE_SERVICE_ROLE_KEY (auto), SUPABASE_URL (auto)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  provider_player_id?: string | null;
};

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
    delete_tournament_refs?: string[];
    seats?: SeatRow[];
    results?: ResultRow[];
    schedule?: ScheduleRow[];
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
  if (seats.length === 0) {
    return new Response(JSON.stringify({ error: "seats[] required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
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

  // Never wipe a verified public draw unless the caller opts in.
  if (!body.force) {
    const { data: existingDraw, error: existingErr } = await admin
      .from("draws")
      .select("id")
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (existingErr) return jsonError(400, existingErr.message, log);
    if (existingDraw?.id) {
      const { count, error: seatCountErr } = await admin
        .from("draw_seats")
        .select("id", { count: "exact", head: true })
        .eq("draw_id", existingDraw.id)
        .eq("is_bye", false)
        .not("provider_player_id", "is", null);
      if (seatCountErr) return jsonError(400, seatCountErr.message, log);
      if ((count ?? 0) > 0) {
        log.push(`skipped: verified draw already published (${count} seats)`);
        return new Response(
          JSON.stringify({
            ok: true,
            skipped: "verified_draw_exists",
            tournament_id: tournamentId,
            draw_id: existingDraw.id,
            seats: count,
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
  for (const table of [
    "pick_voids",
    "bracket_snapshots",
    "brackets",
    "match_results",
    "provider_match_map",
  ] as const) {
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

  const seatRows = seats.map((s) => ({
    draw_id: draw.id,
    position: s.position,
    player_ref: s.player_ref,
    last_name: s.last_name,
    seed: s.seed,
    country_code: s.country_code || "XXX",
    is_bye: Boolean(s.is_bye),
    provider_player_id: s.provider_player_id ?? null,
  }));

  const { error: seatInsErr } = await admin.from("draw_seats").insert(seatRows);
  if (seatInsErr) return jsonError(400, seatInsErr.message, log);
  log.push(`inserted ${seatRows.length} seats`);

  const results = body.results ?? [];
  if (results.length > 0) {
    const now = new Date().toISOString();
    const rows = results.map((r) => ({
      tournament_id: tournamentId,
      match_key: r.match_key,
      winner_ref: r.voided ? null : r.winner_ref ?? null,
      voided: Boolean(r.voided),
      settled_at: now,
    }));
    const { error } = await admin.from("match_results").upsert(rows, {
      onConflict: "tournament_id,match_key",
    });
    if (error) return jsonError(400, error.message, log);
    log.push(`upserted ${rows.length} match_results`);
  }

  const schedule = (body.schedule ?? []).filter((s) => s.match_key && s.scheduled_at);
  if (schedule.length > 0) {
    const now = new Date().toISOString();
    const rows = schedule.map((s) => ({
      tournament_id: tournamentId,
      match_key: s.match_key,
      scheduled_at: s.scheduled_at,
      has_time: Boolean(s.has_time),
      updated_at: now,
    }));
    const { error } = await admin.from("match_schedule").upsert(rows, {
      onConflict: "tournament_id,match_key",
    });
    if (error) return jsonError(400, error.message, log);
    log.push(`upserted ${rows.length} match_schedule`);
  }

  const { data: firstBall, error: lockErr } = await admin.rpc(
    "refresh_tournament_lock_from_schedule",
    { p_tournament_id: tournamentId }
  );
  if (lockErr) return jsonError(400, `lock_at: ${lockErr.message}`, log);
  if (firstBall) log.push(`lock_at ← first ball ${firstBall}`);
  else log.push("lock_at unchanged (no timed main-draw schedule)");

  return new Response(
    JSON.stringify({
      ok: true,
      tournament_id: tournamentId,
      draw_id: draw.id,
      seats: seatRows.length,
      results: results.length,
      schedule: schedule.length,
      lock_at: firstBall ?? null,
      log,
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    }
  );
});

function jsonError(status: number, message: string, log: string[]) {
  return new Response(JSON.stringify({ error: message, log }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
