// supabase/functions/_shared/apply-draw.ts
// Apply official seats, matchups, schedule, and results (used by sync-facts).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildRoundStructure, parseMatchKey } from "./core.js";
import { advanceWinnerToParent } from "./rapidapi.js";

type SeatIn = {
  position: number;
  last_name?: string;
  display_name?: string;
  given_name?: string | null;
  seed?: number | null;
  country_code?: string;
  is_bye?: boolean;
  kind?: "player" | "bye" | "tbd";
  seat_kind?: "player" | "bye" | "tbd";
  entry?: "wc" | "pr" | "q" | "ll" | null;
  entry_status?: "wc" | "pr" | "q" | "ll" | null;
  tbd_label?: string | null;
  provider_player_id?: string | null;
  fallback_formatted?: boolean;
  /** Legacy provider payload field — ignored for storage. */
  player_ref?: string;
};

type ResultIn = {
  match_key: string;
  winner_ref?: string | null;
  winner_provider_id?: string | null;
  winner_player_id?: string | null;
  voided?: boolean;
};

type ScheduleIn = {
  match_key: string;
  scheduled_at: string;
  has_time?: boolean;
};

type MatchupIn = {
  provider_match_id: string;
  match_key?: string;
  player1_ref?: string;
  player1_last_name: string;
  player1_country?: string;
  player1_seed?: number | null;
  player1_provider_id?: string;
  player2_ref?: string;
  player2_last_name: string;
  player2_country?: string;
  player2_seed?: number | null;
  player2_provider_id?: string;
  scheduled_at?: string | null;
  has_time?: boolean;
};

export type ApplyDrawBody = {
  tournament_id?: string;
  tournament_slug?: string;
  /** Alias of tournament_slug for older callers. */
  tournament_ref?: string;
  tournament_patch?: {
    name?: string;
    draw_size?: number;
    provider_id?: string;
    provider_tournament_id?: string;
    tour?: "atp" | "wta";
    surface?: string;
    starts_on?: string;
    ends_on?: string;
    lock_at?: string;
  };
  force?: boolean;
  seats?: SeatIn[];
  results?: ResultIn[];
  schedule?: ScheduleIn[];
  matchups?: MatchupIn[];
  /** provider_match_id → r{R}-m{I} */
  matches?: Record<string, string>;
};

export type ApplyDrawOk = {
  ok: true;
  tournament_id: string;
  log: string[];
  matchups?: number;
  lock_at?: string | null;
  skipped?: string;
  overlaid?: number;
  filled?: number;
  replacements?: number;
  seats?: number;
  results?: number;
  schedule?: number;
  published_at?: string;
};

export type ApplyDrawResult =
  | ApplyDrawOk
  | { ok: false; error: string; log: string[] };

export async function applyDrawFacts(
  admin: SupabaseClient,
  body: ApplyDrawBody,
  log: string[] = []
): Promise<ApplyDrawResult> {
  const seatsIn = body.seats ?? [];
  const matchups = (body.matchups ?? []).filter((m) => {
    const p1 = providerIdFromMatchup(m, 1);
    const p2 = providerIdFromMatchup(m, 2);
    return (
      m.provider_match_id &&
      p1 &&
      p2 &&
      m.player1_last_name &&
      m.player2_last_name &&
      !isFictionalName(m.player1_last_name) &&
      !isFictionalName(m.player2_last_name)
    );
  });

  if (seatsIn.length === 0 && matchups.length === 0) {
    return fail("seats[] or matchups[] required", log);
  }

  let tournamentId = body.tournament_id?.trim() || "";
  const slug =
    body.tournament_slug?.trim() || body.tournament_ref?.trim() || "";
  let expectedDrawSize = 0;
  let publishedAt: string | null = null;

  if (!tournamentId && slug) {
    const { data: tRow, error: tErr } = await admin
      .from("tournaments")
      .select("id, draw_size, published_at")
      .eq("slug", slug)
      .maybeSingle();
    if (tErr) return fail(tErr.message, log);
    if (!tRow?.id) {
      return fail(`tournament not found for slug ${slug}`, log);
    }
    tournamentId = tRow.id;
    expectedDrawSize = Number(tRow.draw_size) || 0;
    publishedAt = tRow.published_at ?? null;
    log.push(`resolved slug ${slug} → ${tournamentId}`);
  } else if (tournamentId) {
    const { data: tRow, error: tErr } = await admin
      .from("tournaments")
      .select("draw_size, published_at")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tErr) return fail(tErr.message, log);
    expectedDrawSize = Number(tRow?.draw_size) || 0;
    publishedAt = tRow?.published_at ?? null;
  }

  if (!tournamentId) {
    return fail(
      "tournament_id or tournament_slug (or tournament_ref) required",
      log
    );
  }

  const patch = normalizeTournamentPatch(body.tournament_patch);
  if (patch) {
    const { error } = await admin
      .from("tournaments")
      .update(patch)
      .eq("id", tournamentId);
    if (error) return fail(error.message, log);
    if (patch.draw_size != null) expectedDrawSize = Number(patch.draw_size) || 0;
    log.push("patched tournament");
  }

  if (
    seatsIn.length > 0 &&
    expectedDrawSize > 0 &&
    seatsIn.length !== expectedDrawSize
  ) {
    return fail(
      `${slug || tournamentId} rejects ${seatsIn.length}-draw (need ${expectedDrawSize} singles)`,
      log
    );
  }

  // Provider id → players.id for this request.
  const playerByProvider = new Map<string, string>();

  if (matchups.length > 0) {
    const people = [];
    for (const m of matchups) {
      people.push({
        provider_id: providerIdFromMatchup(m, 1)!,
        last_name: m.player1_last_name.trim(),
        country_code: countryOf(m.player1_country),
      });
      people.push({
        provider_id: providerIdFromMatchup(m, 2)!,
        last_name: m.player2_last_name.trim(),
        country_code: countryOf(m.player2_country),
      });
    }
    const up = await upsertPlayers(admin, people, playerByProvider, log);
    if (up) return fail(up, log);

    const matchErr = await upsertAnnouncedMatches(
      admin,
      tournamentId,
      matchups,
      playerByProvider,
      log
    );
    if (matchErr) return fail(matchErr, log);
  }

  if (seatsIn.length === 0) {
    const { data: lockAt, error: lockErr } = await admin.rpc("refresh_lock_at", {
      p_tournament_id: tournamentId,
    });
    if (lockErr) return fail(`lock_at: ${lockErr.message}`, log);
    if (lockAt) log.push(`lock_at ← first ball ${lockAt}`);

    return {
      ok: true,
      tournament_id: tournamentId,
      matchups: matchups.length,
      lock_at: lockAt ?? null,
      log,
    };
  }

  const seats = seatsIn
    .map((s) => normalizeSeat(s, tournamentId))
    .filter(Boolean) as NormalizedSeat[];
  if (seats.length !== seatsIn.length) {
    return fail("seats contain fictional or invalid rows", log);
  }

  // Validate official sheet before any write.
  const { validateOfficialSeats, hashDrawSeats, diffDrawSeats, evaluateDrawIntegrity } =
    await import("./rapidapi.js");
  const validated = validateOfficialSeats(
    seats.map((s) => ({
      position: s.position,
      kind: s.kind,
      seat_kind: s.kind,
      provider_player_id: s.provider_player_id,
      last_name: s.last_name,
      display_name: s.display_name,
      seed: s.seed,
      entry_status: s.entry,
      tbd_label: s.tbd_label,
      is_bye: s.kind === "bye",
      country_code: s.country_code,
      fallback_formatted: s.fallback_formatted,
    }))
  );
  if (!validated.ok) {
    return fail(`draw validation: ${validated.reason}`, log);
  }

  const revisionHash = await hashDrawSeats(
    seats.map((s) => ({
      position: s.position,
      kind: s.kind,
      seat_kind: s.kind,
      provider_player_id: s.provider_player_id,
      last_name: s.last_name,
      seed: s.seed,
      entry_status: s.entry,
      tbd_label: s.tbd_label,
      is_bye: s.kind === "bye",
    }))
  );

  const { data: hashRow } = await admin
    .from("tournaments")
    .select("draw_hash, lock_at")
    .eq("id", tournamentId)
    .maybeSingle();

  if (
    !body.force &&
    hashRow?.draw_hash &&
    hashRow.draw_hash === revisionHash
  ) {
    await admin
      .from("tournaments")
      .update({ draw_checked_at: new Date().toISOString() })
      .eq("id", tournamentId);
    log.push("draw hash unchanged — checked_at bumped");
    const facts = await applyMatchFacts(
      admin,
      tournamentId,
      seats.length,
      playerByProvider,
      body.matches,
      body.schedule,
      body.results,
      /* replaceTopology */ false,
      log
    );
    if (facts.error) return fail(facts.error, log);
    return {
      ok: true,
      skipped: "draw_hash_unchanged",
      tournament_id: tournamentId,
      seats: seats.length,
      results: facts.results,
      schedule: facts.schedule,
      lock_at: facts.lockAt,
      log,
    };
  }

  // Never wipe a verified public draw unless force — overlay + replacement diff.
  if (!body.force && publishedAt) {
    const { count, error: cErr } = await admin
      .from("seats")
      .select("position", { count: "exact", head: true })
      .eq("tournament_id", tournamentId);
    if (cErr) return fail(cErr.message, log);
    const existingCount = count ?? 0;
    const officialSize = expectedDrawSize || seats.length;
    if (existingCount > 0 && existingCount === officialSize) {
      if (seats.length === existingCount) {
        const { data: prevSeatRows } = await admin
          .from("seats")
          .select(
            "position, kind, tbd_label, player_id, seed, entry, players(provider_id)"
          )
          .eq("tournament_id", tournamentId);

        const prevSeats = (prevSeatRows ?? []).map((row) => {
          const pl = Array.isArray(row.players)
            ? row.players[0]
            : row.players;
          return {
            position: Number(row.position),
            kind: row.kind,
            seat_kind: row.kind,
            provider_player_id: pl?.provider_id
              ? String(pl.provider_id)
              : null,
            tbd_label: row.tbd_label,
          };
        });

        const nextForDiff = seats.map((s) => ({
          position: s.position,
          kind: s.kind,
          seat_kind: s.kind,
          provider_player_id: s.provider_player_id,
          tbd_label: s.tbd_label,
        }));
        const changes = diffDrawSeats(prevSeats, nextForDiff).filter(
          (c) => c.change_kind !== "same"
        );

        const overlay = await overlayExistingSeats(
          admin,
          tournamentId,
          seats,
          playerByProvider,
          log,
          { allowReplacement: true }
        );
        if (overlay.error) return fail(overlay.error, log);

        if (changes.length > 0) {
          await admin.from("draw_revisions").upsert(
            {
              tournament_id: tournamentId,
              hash: revisionHash,
              payload: { seats: nextForDiff },
              detected_at: new Date().toISOString(),
            },
            { onConflict: "tournament_id,hash" }
          );
          const { error: repErr } = await admin.from("draw_replacements").insert(
            changes.map((c) => ({
              tournament_id: tournamentId,
              position: c.position,
              old_provider_player_id: c.old_provider_player_id,
              new_provider_player_id: c.new_provider_player_id,
              old_kind: c.old_kind,
              new_kind: c.new_kind,
              change_kind: c.change_kind,
              revision_hash: revisionHash,
            }))
          );
          if (repErr) log.push(`draw_replacements: ${repErr.message}`);
          else log.push(`recorded ${changes.length} draw replacements`);

          // Invalidate event_map + provider_match_id for changed R0 pairs.
          await invalidateMappingsForReplacements(
            admin,
            tournamentId,
            changes,
            log
          );

          // Pre-lock: rewrite picks that named the outgoing player.
          const locked =
            hashRow?.lock_at &&
            Date.parse(String(hashRow.lock_at)) <= Date.now();
          if (!locked) {
            await rewritePicksForReplacements(
              admin,
              tournamentId,
              changes,
              playerByProvider,
              log
            );
          } else {
            log.push(
              "post-lock replacements: picks preserved; grade vs official winners"
            );
          }
        }

        await admin
          .from("tournaments")
          .update({
            draw_hash: revisionHash,
            draw_checked_at: new Date().toISOString(),
          })
          .eq("id", tournamentId);

        const facts = await applyMatchFacts(
          admin,
          tournamentId,
          seats.length,
          playerByProvider,
          body.matches,
          body.schedule,
          body.results,
          /* replaceTopology */ false,
          log
        );
        if (facts.error) return fail(facts.error, log);

        // Rebind R0 sides from seats after replacement overlay.
        await refreshRoundZeroSides(admin, tournamentId, playerByProvider, log);

        return {
          ok: true,
          skipped: "verified_draw_exists",
          overlaid: overlay.mapped,
          filled: overlay.filled,
          replacements: changes.length,
          tournament_id: tournamentId,
          seats: existingCount,
          results: facts.results,
          schedule: facts.schedule,
          lock_at: facts.lockAt,
          log,
        };
      }
      log.push(`skipped: verified draw already published (${existingCount} seats)`);
      return {
        ok: true,
        skipped: "verified_draw_exists",
        tournament_id: tournamentId,
        seats: existingCount,
        log,
      };
    }
  }

  // Named players only — byes/TBDs have no player row.
  // Prefer real Tennis API ids; mds: keys are only for unmapped official names.
  const named = seats
    .filter((s) => s.kind === "player" && s.provider_player_id)
    .map((s) => ({
      provider_id: s.provider_player_id!,
      last_name: s.last_name!,
      display_name: s.display_name || s.last_name!,
      country_code: s.country_code,
    }));
  const upErr = await upsertPlayers(admin, named, playerByProvider, log);
  if (upErr) return fail(upErr, log);

  const drawSize = seats.length;
  const now = new Date().toISOString();

  const { data: tourMeta } = await admin
    .from("tournaments")
    .select(
      "tour, provider_id, surface, bracket_eligible, draw_checked_at, draw_size"
    )
    .eq("id", tournamentId)
    .maybeSingle();

  // Integrity before any wipe — never destroy a live public sheet on a bad candidate.
  const integrity = evaluateDrawIntegrity({
    seats: seats.map((s) => ({
      position: s.position,
      kind: s.kind,
      seat_kind: s.kind,
      provider_player_id: s.provider_player_id,
      last_name: s.last_name,
      display_name: s.display_name || s.last_name,
      given_name: s.given_name,
      seed: s.seed,
      country_code: s.country_code,
      fallback_formatted: s.fallback_formatted,
      tbd_label: s.tbd_label,
    })),
    tournament: {
      tour: tourMeta?.tour,
      provider_id: tourMeta?.provider_id,
      surface: tourMeta?.surface,
      bracket_eligible: tourMeta?.bracket_eligible,
      draw_checked_at: tourMeta?.draw_checked_at,
      draw_size: tourMeta?.draw_size ?? drawSize,
    },
    drawTour: tourMeta?.tour,
    drawProviderId: tourMeta?.provider_id
      ? String(tourMeta.provider_id)
      : null,
    source: "official",
    sourceSnapshotId: revisionHash,
  });

  await admin.from("draw_integrity_reports").upsert(
    {
      tournament_id: tournamentId,
      checked_at: integrity.checkedAt,
      safe_to_publish: integrity.safeToPublish,
      blocking: integrity.blockingErrors,
      warnings: integrity.warnings,
      source_snapshot_id: revisionHash,
    },
    { onConflict: "tournament_id" }
  );

  if (!integrity.safeToPublish) {
    await admin
      .from("tournaments")
      .update({ draw_checked_at: now })
      .eq("id", tournamentId);
    await admin.from("ops_events").insert({
      kind: "integrity",
      name: publishedAt ? "refresh_blocked_keep_published" : "publish_blocked",
      payload: {
        tournament_id: tournamentId,
        published: Boolean(publishedAt),
        blocking: integrity.blockingErrors,
        warnings: integrity.warnings,
      },
    });
    log.push(
      `integrity gate blocked: ${integrity.blockingErrors
        .map((e: { code: string }) => e.code)
        .join(",")}${publishedAt ? " (kept published sheet)" : ""}`
    );
    if (publishedAt) {
      return {
        ok: true,
        skipped: "integrity_blocked_keep_published",
        tournament_id: tournamentId,
        seats: drawSize,
        log,
      };
    }
    return fail(
      `integrity blocked: ${integrity.blockingErrors
        .map((e: { code: string; message: string }) => e.message)
        .join("; ")}`,
      log
    );
  }

  if (body.force) {
    const { error: pickBrackets } = await admin
      .from("brackets")
      .delete()
      .eq("tournament_id", tournamentId);
    if (pickBrackets) {
      return fail(`wipe brackets: ${pickBrackets.message}`, log);
    }
    log.push("wiped brackets (force)");
  }

  const { error: seatDelErr } = await admin
    .from("seats")
    .delete()
    .eq("tournament_id", tournamentId);
  if (seatDelErr) return fail(seatDelErr.message, log);
  log.push("wiped seats");

  const seatRows = seats.map((s) => ({
    tournament_id: tournamentId,
    position: s.position,
    kind: s.kind,
    player_id:
      s.kind === "player" && s.provider_player_id
        ? playerByProvider.get(s.provider_player_id) ?? null
        : null,
    seed: s.seed,
    entry: s.entry,
    tbd_label: s.kind === "tbd" ? s.tbd_label : null,
  }));

  for (const row of seatRows) {
    if (row.kind === "player" && !row.player_id) {
      return fail(
        `seat ${row.position}: player kind requires mapped provider player`,
        log
      );
    }
  }

  const { error: seatInsErr } = await admin.from("seats").insert(seatRows);
  if (seatInsErr) return fail(seatInsErr.message, log);
  log.push(`inserted ${seatRows.length} seats`);

  const { error: pubErr } = await admin
    .from("tournaments")
    .update({
      draw_size: drawSize,
      published_at: now,
      draw_hash: revisionHash,
      draw_checked_at: now,
    })
    .eq("id", tournamentId);
  if (pubErr) return fail(pubErr.message, log);
  log.push(`published_at set; draw_size=${drawSize}`);

  await admin.from("draw_revisions").upsert(
    {
      tournament_id: tournamentId,
      hash: revisionHash,
      payload: {
        seats: seats.map((s) => ({
          position: s.position,
          kind: s.kind,
          provider_player_id: s.provider_player_id,
        })),
      },
      detected_at: now,
    },
    { onConflict: "tournament_id,hash" }
  );

  const facts = await applyMatchFacts(
    admin,
    tournamentId,
    drawSize,
    playerByProvider,
    body.matches,
    body.schedule,
    body.results,
    /* replaceTopology */ true,
    log
  );
  if (facts.error) return fail(facts.error, log);

  return {
    ok: true,
    tournament_id: tournamentId,
    seats: seatRows.length,
    results: facts.results,
    schedule: facts.schedule,
    lock_at: facts.lockAt,
    published_at: now,
    log,
  };
}

type NormalizedSeat = {
  position: number;
  kind: "player" | "bye" | "tbd";
  last_name: string | null;
  display_name: string | null;
  fallback_formatted: boolean;
  seed: number | null;
  country_code: string;
  entry: "wc" | "pr" | "q" | "ll" | null;
  tbd_label: string | null;
  provider_player_id: string | null;
};

function normalizeSeat(
  s: SeatIn,
  tournamentId: string
): NormalizedSeat | null {
  const kind: "player" | "bye" | "tbd" =
    s.kind || s.seat_kind || (s.is_bye ? "bye" : "player");
  const position = Number(s.position);
  if (!Number.isInteger(position) || position < 0) return null;

  if (kind === "bye") {
    return {
      position,
      kind: "bye",
      last_name: null,
      display_name: null,
      fallback_formatted: false,
      seed: s.seed == null ? null : Number(s.seed),
      country_code: "XXX",
      entry: null,
      tbd_label: null,
      provider_player_id: null,
    };
  }

  if (kind === "tbd") {
    const label = (s.tbd_label || s.last_name || "Qualifier").trim();
    if (!label) return null;
    return {
      position,
      kind: "tbd",
      last_name: null,
      display_name: null,
      fallback_formatted: false,
      seed: s.seed == null ? null : Number(s.seed),
      country_code: countryOf(s.country_code),
      entry: s.entry ?? s.entry_status ?? null,
      tbd_label: label,
      provider_player_id: null,
    };
  }

  const rawName = String(s.display_name || s.last_name || "").trim();
  if (!rawName || isFictionalName(rawName)) return null;
  // Prefer provider display; fall back to last_name field as display.
  const display = String(s.display_name || rawName).trim();
  const last = String(s.last_name || rawName).trim();
  // Official named seat without Tennis API id yet: stable MDS key (not a fake name).
  const providerId = s.provider_player_id
    ? String(s.provider_player_id).trim()
    : `mds:${tournamentId}:${position}`;
  if (!providerId) return null;

  return {
    position,
    kind: "player",
    last_name: last,
    display_name: display,
    fallback_formatted: Boolean(s.fallback_formatted),
    seed: s.seed == null ? null : Number(s.seed),
    country_code: countryOf(s.country_code),
    entry: s.entry ?? s.entry_status ?? null,
    tbd_label: null,
    provider_player_id: providerId,
  };
}

function isFictionalName(name: string): boolean {
  const n = String(name || "").trim();
  return /^player\s*\d+$/i.test(n) || /^p-\d+$/i.test(n);
}

function countryOf(raw: string | null | undefined): string {
  const c = String(raw || "XXX").slice(0, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : "XXX";
}

function providerIdFromMatchup(m: MatchupIn, side: 1 | 2): string | null {
  if (side === 1) {
    if (m.player1_provider_id) return String(m.player1_provider_id).trim();
    return extractProviderId(m.player1_ref);
  }
  if (m.player2_provider_id) return String(m.player2_provider_id).trim();
  return extractProviderId(m.player2_ref);
}

/** Accept bare provider ids or legacy `atp-12345` / `wta-12345` refs. */
function extractProviderId(ref: string | null | undefined): string | null {
  const s = String(ref || "").trim();
  if (!s) return null;
  const m = s.match(/^(?:atp|wta)-(.+)$/i);
  if (m) return m[1];
  if (/^\d+$/.test(s)) return s;
  return s;
}

function normalizeTournamentPatch(
  patch: {
    name?: string;
    draw_size?: number;
    provider_id?: string;
    provider_tournament_id?: string;
    tour?: "atp" | "wta";
    surface?: string;
    starts_on?: string;
    ends_on?: string;
    lock_at?: string;
  } | undefined
): Record<string, unknown> | null {
  if (!patch) return null;
  const out: Record<string, unknown> = {};
  if (patch.name != null) out.name = patch.name;
  if (patch.draw_size != null) out.draw_size = patch.draw_size;
  if (patch.tour != null) out.tour = patch.tour;
  if (patch.surface != null) out.surface = patch.surface;
  if (patch.starts_on != null) out.starts_on = patch.starts_on;
  if (patch.ends_on != null) out.ends_on = patch.ends_on;
  if (patch.lock_at != null) out.lock_at = patch.lock_at;
  const providerId = patch.provider_id ?? patch.provider_tournament_id;
  if (providerId != null) out.provider_id = String(providerId);
  return Object.keys(out).length ? out : null;
}

async function upsertPlayers(
  admin: SupabaseClient,
  people: {
    provider_id: string;
    last_name: string;
    display_name?: string;
    country_code: string;
  }[],
  playerByProvider: Map<string, string>,
  log: string[]
): Promise<string | null> {
  const byId = new Map<
    string,
    {
      provider_id: string;
      last_name: string;
      display_name: string;
      country_code: string;
    }
  >();
  for (const p of people) {
    if (!p.provider_id || !p.last_name || isFictionalName(p.last_name)) continue;
    byId.set(p.provider_id, {
      provider_id: p.provider_id,
      last_name: p.last_name,
      display_name: (p.display_name || p.last_name).trim(),
      country_code: p.country_code,
    });
  }
  const rows = [...byId.values()];
  if (rows.length === 0) return null;

  const { data, error } = await admin
    .from("players")
    .upsert(rows, { onConflict: "provider_id" })
    .select("id, provider_id");
  if (error) return `players: ${error.message}`;
  for (const row of data ?? []) {
    playerByProvider.set(String(row.provider_id), String(row.id));
  }
  log.push(`upserted ${rows.length} players`);
  return null;
}

async function upsertAnnouncedMatches(
  admin: SupabaseClient,
  tournamentId: string,
  matchups: MatchupIn[],
  playerByProvider: Map<string, string>,
  log: string[]
): Promise<string | null> {
  // Announced pairs before a full sheet: store as R0 matches keyed by
  // provider_match_id. Full publish later rewrites topology.
  for (let i = 0; i < matchups.length; i++) {
    const m = matchups[i];
    const p1 = providerIdFromMatchup(m, 1)!;
    const p2 = providerIdFromMatchup(m, 2)!;
    const sideA = playerByProvider.get(p1);
    const sideB = playerByProvider.get(p2);
    if (!sideA || !sideB) {
      return `matchup ${m.provider_match_id}: missing player uuid`;
    }
    const row = {
      tournament_id: tournamentId,
      round: 0,
      index_in_round: i,
      provider_match_id: String(m.provider_match_id),
      side_a_player_id: sideA,
      side_b_player_id: sideB,
      scheduled_at: m.scheduled_at || null,
      has_time: Boolean(m.has_time && m.scheduled_at),
    };
    const { data: existing } = await admin
      .from("matches")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("provider_match_id", row.provider_match_id)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await admin
        .from("matches")
        .update({
          side_a_player_id: row.side_a_player_id,
          side_b_player_id: row.side_b_player_id,
          scheduled_at: row.scheduled_at,
          has_time: row.has_time,
        })
        .eq("id", existing.id);
      if (error) return `matchups: ${error.message}`;
    } else {
      // Prefer stable index if slot free; else append after max R0 index.
      const { data: clash } = await admin
        .from("matches")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("round", 0)
        .eq("index_in_round", i)
        .maybeSingle();
      let index = i;
      if (clash?.id) {
        const { data: maxRows } = await admin
          .from("matches")
          .select("index_in_round")
          .eq("tournament_id", tournamentId)
          .eq("round", 0)
          .order("index_in_round", { ascending: false })
          .limit(1);
        index = Number(maxRows?.[0]?.index_in_round ?? -1) + 1;
      }
      const { error } = await admin.from("matches").insert({
        ...row,
        index_in_round: index,
      });
      if (error) return `matchups: ${error.message}`;
    }
  }
  log.push(`upserted ${matchups.length} announced matches`);
  return null;
}

async function overlayExistingSeats(
  admin: SupabaseClient,
  tournamentId: string,
  seats: NormalizedSeat[],
  playerByProvider: Map<string, string>,
  log: string[],
  opts: { allowReplacement?: boolean } = {}
): Promise<{ error: string | null; mapped: number; filled: number }> {
  const named = seats
    .filter(
      (s) =>
        s.kind === "player" &&
        s.provider_player_id &&
        !String(s.provider_player_id).startsWith("mds:")
    )
    .map((s) => ({
      provider_id: s.provider_player_id!,
      last_name: s.last_name!,
      display_name: s.display_name || s.last_name!,
      country_code: s.country_code,
    }));
  const upErr = await upsertPlayers(admin, named, playerByProvider, log);
  if (upErr) return { error: upErr, mapped: 0, filled: 0 };

  const { data: current, error } = await admin
    .from("seats")
    .select("position, kind, tbd_label, player_id")
    .eq("tournament_id", tournamentId);
  if (error) return { error: error.message, mapped: 0, filled: 0 };

  const byPos = new Map((current ?? []).map((s) => [Number(s.position), s]));
  let mapped = 0;
  let filled = 0;

  for (const s of seats) {
    const existing = byPos.get(s.position);
    if (!existing) continue;
    const patch: Record<string, unknown> = {};
    const realProvider =
      s.provider_player_id && !String(s.provider_player_id).startsWith("mds:")
        ? s.provider_player_id
        : null;

    if (s.kind === "player" && realProvider) {
      const pid = playerByProvider.get(realProvider);
      if (pid) {
        const isTbdFill = existing.kind === "tbd";
        const isReplacement =
          Boolean(opts.allowReplacement) &&
          existing.kind === "player" &&
          existing.player_id &&
          existing.player_id !== pid;
        if (isTbdFill || isReplacement || !existing.player_id) {
          patch.player_id = pid;
          patch.seed = s.seed;
          patch.entry = s.entry;
          patch.kind = "player";
          patch.tbd_label = null;
          if (isTbdFill) filled += 1;
        } else if (existing.player_id === pid) {
          patch.seed = s.seed;
          patch.entry = s.entry;
        }
      }
    }

    if (s.kind === "bye" && opts.allowReplacement) {
      patch.kind = "bye";
      patch.player_id = null;
      patch.tbd_label = null;
      patch.entry = null;
    }

    if (s.kind === "tbd" && opts.allowReplacement && existing.kind === "player") {
      // Rare: named → TBD; keep as tbd only if product allows — skip by default.
    }

    if (Object.keys(patch).length === 0) continue;
    const { error: upSeatErr } = await admin
      .from("seats")
      .update(patch)
      .eq("tournament_id", tournamentId)
      .eq("position", s.position);
    if (upSeatErr) return { error: upSeatErr.message, mapped, filled };
    mapped += 1;
  }

  log.push(
    `kept official draw; overlaid ${mapped} seats; filled ${filled} TBD`
  );
  return { error: null, mapped, filled };
}

async function refreshRoundZeroSides(
  admin: SupabaseClient,
  tournamentId: string,
  playerByProvider: Map<string, string>,
  log: string[]
) {
  const { data: seats } = await admin
    .from("seats")
    .select("position, kind, player_id")
    .eq("tournament_id", tournamentId)
    .order("position");
  if (!seats?.length) return;
  const byPos = new Map(seats.map((s) => [Number(s.position), s]));
  const { data: r0 } = await admin
    .from("matches")
    .select("id, index_in_round, winner_player_id, settled_at")
    .eq("tournament_id", tournamentId)
    .eq("round", 0);
  let n = 0;
  for (const m of r0 ?? []) {
    const i = Number(m.index_in_round);
    const a = byPos.get(i * 2);
    const b = byPos.get(i * 2 + 1);
    const sideA = a?.kind === "player" ? a.player_id : null;
    const sideB = b?.kind === "player" ? b.player_id : null;
    const patch: Record<string, unknown> = {
      side_a_player_id: sideA,
      side_b_player_id: sideB,
    };
    // Re-apply bye settle if needed and not already settled with a winner.
    let byeWinner: string | null = null;
    if (!m.winner_player_id) {
      const now = new Date().toISOString();
      if (a?.kind === "bye" && sideB) {
        patch.winner_player_id = sideB;
        patch.settled_at = now;
        byeWinner = sideB;
      } else if (b?.kind === "bye" && sideA) {
        patch.winner_player_id = sideA;
        patch.settled_at = now;
        byeWinner = sideA;
      }
    } else if (
      (a?.kind === "bye" && sideB && m.winner_player_id === sideB) ||
      (b?.kind === "bye" && sideA && m.winner_player_id === sideA)
    ) {
      byeWinner = m.winner_player_id as string;
    }
    await admin.from("matches").update(patch).eq("id", m.id);
    if (byeWinner) {
      await advanceWinnerIntoParentMatch(
        admin,
        tournamentId,
        0,
        i,
        byeWinner
      );
    }
    n += 1;
  }
  void playerByProvider;
  if (n) log.push(`refreshed ${n} R0 match sides from seats`);
}

async function invalidateMappingsForReplacements(
  admin: SupabaseClient,
  tournamentId: string,
  changes: {
    position: number;
    old_provider_player_id: string | null;
    new_provider_player_id: string | null;
    change_kind: string;
  }[],
  log: string[]
) {
  const providerIds = new Set<string>();
  for (const c of changes) {
    if (c.old_provider_player_id) providerIds.add(c.old_provider_player_id);
    if (c.new_provider_player_id) providerIds.add(c.new_provider_player_id);
  }
  if (providerIds.size === 0) return;

  const { data: people } = await admin
    .from("players")
    .select("id, provider_id")
    .in("provider_id", [...providerIds]);
  const playerUuids = (people ?? []).map((p) => p.id as string);
  if (playerUuids.length === 0) return;

  // Clear provider_match_id on R0 matches involving replaced players.
  const { data: r0 } = await admin
    .from("matches")
    .select("id, side_a_player_id, side_b_player_id")
    .eq("tournament_id", tournamentId)
    .eq("round", 0);
  for (const m of r0 ?? []) {
    if (
      (m.side_a_player_id && playerUuids.includes(m.side_a_player_id)) ||
      (m.side_b_player_id && playerUuids.includes(m.side_b_player_id))
    ) {
      await admin
        .from("matches")
        .update({
          provider_match_id: null,
          side_a_player_id:
            m.side_a_player_id && playerUuids.includes(m.side_a_player_id)
              ? m.side_a_player_id
              : m.side_a_player_id,
          side_b_player_id: m.side_b_player_id,
        })
        .eq("id", m.id);
      // Re-bind sides from seats after overlay — done by caller refresh.
      await admin
        .from("event_map")
        .update({ status: "stale", socket_event_id: null })
        .eq("match_id", m.id);
    }
  }
  log.push("invalidated match/event mappings for replacements");
}

/**
 * Pre-lock pick policy: rewrite picks that named the outgoing player to the
 * incoming player on the same match. Post-lock callers must skip this.
 */
async function rewritePicksForReplacements(
  admin: SupabaseClient,
  tournamentId: string,
  changes: {
    old_provider_player_id: string | null;
    new_provider_player_id: string | null;
    change_kind: string;
  }[],
  playerByProvider: Map<string, string>,
  log: string[]
) {
  let rewritten = 0;
  for (const c of changes) {
    if (c.change_kind !== "replacement" && c.change_kind !== "tbd_filled") {
      continue;
    }
    if (!c.old_provider_player_id || !c.new_provider_player_id) continue;
    const oldId =
      playerByProvider.get(c.old_provider_player_id) ||
      (
        await admin
          .from("players")
          .select("id")
          .eq("provider_id", c.old_provider_player_id)
          .maybeSingle()
      ).data?.id;
    const newId =
      playerByProvider.get(c.new_provider_player_id) ||
      (
        await admin
          .from("players")
          .select("id")
          .eq("provider_id", c.new_provider_player_id)
          .maybeSingle()
      ).data?.id;
    if (!oldId || !newId || oldId === newId) continue;

    const { data: matchRows } = await admin
      .from("matches")
      .select("id")
      .eq("tournament_id", tournamentId)
      .or(`side_a_player_id.eq.${oldId},side_b_player_id.eq.${oldId}`);

    const matchIds = (matchRows ?? []).map((m) => m.id);
    if (matchIds.length === 0) continue;

    const { data: brackets } = await admin
      .from("brackets")
      .select("id")
      .eq("tournament_id", tournamentId)
      .is("submitted_at", null);
    const bracketIds = (brackets ?? []).map((b) => b.id);
    if (bracketIds.length === 0) continue;

    const { error } = await admin
      .from("picks")
      .update({ player_id: newId, updated_at: new Date().toISOString() })
      .in("bracket_id", bracketIds)
      .in("match_id", matchIds)
      .eq("player_id", oldId);
    if (!error) rewritten += 1;
  }
  if (rewritten) log.push(`pre-lock rewritten pick sets: ${rewritten}`);
}

async function applyMatchFacts(
  admin: SupabaseClient,
  tournamentId: string,
  drawSize: number,
  playerByProvider: Map<string, string>,
  matchesMap: Record<string, string> | undefined,
  schedule: ScheduleIn[] | undefined,
  results: ResultIn[] | undefined,
  replaceTopology: boolean,
  log: string[]
): Promise<{
  error: string | null;
  results: number;
  schedule: number;
  lockAt: string | null;
}> {
  if (replaceTopology) {
    const { error: delErr } = await admin
      .from("matches")
      .delete()
      .eq("tournament_id", tournamentId);
    if (delErr) {
      return {
        error: `wipe matches: ${delErr.message}`,
        results: 0,
        schedule: 0,
        lockAt: null,
      };
    }
    log.push("wiped matches");

    const { data: seatRows, error: seatErr } = await admin
      .from("seats")
      .select("position, kind, player_id")
      .eq("tournament_id", tournamentId)
      .order("position");
    if (seatErr) {
      return { error: seatErr.message, results: 0, schedule: 0, lockAt: null };
    }

    const byPos = new Map(
      (seatRows ?? []).map((s) => [Number(s.position), s])
    );
    const structure = buildRoundStructure(drawSize);
    const now = new Date().toISOString();
    const insertRows: Record<string, unknown>[] = [];

    for (const round of structure) {
      for (const match of round.matches) {
        const row: Record<string, unknown> = {
          tournament_id: tournamentId,
          round: match.round,
          index_in_round: match.indexInRound,
          provider_match_id: null,
          side_a_player_id: null,
          side_b_player_id: null,
          scheduled_at: null,
          has_time: false,
          winner_player_id: null,
          voided: false,
          settled_at: null,
        };

        if (match.round === 0) {
          const a = byPos.get(match.indexInRound * 2);
          const b = byPos.get(match.indexInRound * 2 + 1);
          const aPlayer = a?.kind === "player" ? a.player_id : null;
          const bPlayer = b?.kind === "player" ? b.player_id : null;
          const aBye = a?.kind === "bye";
          const bBye = b?.kind === "bye";
          row.side_a_player_id = aPlayer;
          row.side_b_player_id = bPlayer;
          if (aBye && bPlayer) {
            row.winner_player_id = bPlayer;
            row.settled_at = now;
          } else if (bBye && aPlayer) {
            row.winner_player_id = aPlayer;
            row.settled_at = now;
          }
        }
        insertRows.push(row);
      }
    }

    const { error: insErr } = await admin.from("matches").insert(insertRows);
    if (insErr) {
      return {
        error: `matches insert: ${insErr.message}`,
        results: 0,
        schedule: 0,
        lockAt: null,
      };
    }
    log.push(`inserted ${insertRows.length} matches`);
    // Bye auto-settle on insert does not advance — push winners into R1 sides now.
    for (const row of insertRows) {
      if (row.round !== 0 || !row.winner_player_id) continue;
      await advanceWinnerIntoParentMatch(
        admin,
        tournamentId,
        0,
        Number(row.index_in_round),
        String(row.winner_player_id)
      );
    }
  }

  // Ensure player map covers all tournament seats (overlay / reconcile path).
  if (playerByProvider.size === 0) {
    const { data: seatPlayers } = await admin
      .from("seats")
      .select("player_id")
      .eq("tournament_id", tournamentId)
      .not("player_id", "is", null);
    const ids = [
      ...new Set(
        (seatPlayers ?? [])
          .map((s) => s.player_id as string)
          .filter(Boolean)
      ),
    ];
    if (ids.length > 0) {
      const { data: people } = await admin
        .from("players")
        .select("id, provider_id")
        .in("id", ids);
      for (const p of people ?? []) {
        if (p.provider_id) {
          playerByProvider.set(String(p.provider_id), String(p.id));
        }
      }
    }
  }

  if (matchesMap && typeof matchesMap === "object") {
    for (const [providerMatchId, key] of Object.entries(matchesMap)) {
      const parsed = parseMatchKey(key);
      if (!providerMatchId || !parsed) continue;
      const pmid = String(providerMatchId);

      // Unique (tournament_id, provider_match_id): free any prior holder
      // (e.g. announced R0 row) before binding to the official node.
      await admin
        .from("matches")
        .update({ provider_match_id: null })
        .eq("tournament_id", tournamentId)
        .eq("provider_match_id", pmid);

      const { error } = await admin
        .from("matches")
        .update({ provider_match_id: pmid })
        .eq("tournament_id", tournamentId)
        .eq("round", parsed.round)
        .eq("index_in_round", parsed.indexInRound);
      if (error) {
        return {
          error: `provider_match_id: ${error.message}`,
          results: 0,
          schedule: 0,
          lockAt: null,
        };
      }
    }
    log.push(`mapped ${Object.keys(matchesMap).length} provider match ids`);
  }

  const scheduleRows = (schedule ?? []).filter(
    (s) => s.match_key && s.scheduled_at
  );
  for (const s of scheduleRows) {
    const parsed = parseMatchKey(s.match_key);
    if (!parsed) continue;
    const { error } = await admin
      .from("matches")
      .update({
        scheduled_at: s.scheduled_at,
        has_time: Boolean(s.has_time),
      })
      .eq("tournament_id", tournamentId)
      .eq("round", parsed.round)
      .eq("index_in_round", parsed.indexInRound);
    if (error) {
      return {
        error: `schedule: ${error.message}`,
        results: 0,
        schedule: 0,
        lockAt: null,
      };
    }
  }
  if (scheduleRows.length) log.push(`scheduled ${scheduleRows.length} matches`);

  const resultRows = results ?? [];
  const now = new Date().toISOString();
  for (const r of resultRows) {
    const parsed = parseMatchKey(r.match_key);
    if (!parsed) continue;
    let winnerId: string | null = null;
    if (!r.voided) {
      if (r.winner_player_id) {
        winnerId = r.winner_player_id;
      } else {
        const providerId =
          r.winner_provider_id ||
          extractProviderId(r.winner_ref) ||
          null;
        if (providerId) {
          winnerId = playerByProvider.get(providerId) ?? null;
          if (!winnerId) {
            const { data: p } = await admin
              .from("players")
              .select("id")
              .eq("provider_id", providerId)
              .maybeSingle();
            winnerId = p?.id ?? null;
            if (winnerId) playerByProvider.set(providerId, winnerId);
          }
        }
      }
      if (!winnerId) continue;
    }

    // Load sides so CHECK (winner ∈ sides) can pass; set missing side if needed.
    const { data: matchRow, error: mErr } = await admin
      .from("matches")
      .select("id, side_a_player_id, side_b_player_id")
      .eq("tournament_id", tournamentId)
      .eq("round", parsed.round)
      .eq("index_in_round", parsed.indexInRound)
      .maybeSingle();
    if (mErr) {
      return {
        error: `results: ${mErr.message}`,
        results: 0,
        schedule: scheduleRows.length,
        lockAt: null,
      };
    }
    if (!matchRow) continue;

    const patch: Record<string, unknown> = {
      voided: Boolean(r.voided),
      winner_player_id: r.voided ? null : winnerId,
      settled_at: now,
    };

    if (
      winnerId &&
      matchRow.side_a_player_id !== winnerId &&
      matchRow.side_b_player_id !== winnerId
    ) {
      if (!matchRow.side_a_player_id) patch.side_a_player_id = winnerId;
      else if (!matchRow.side_b_player_id) patch.side_b_player_id = winnerId;
      else {
        // Winner not on either known side — skip (fail closed).
        continue;
      }
    }

    const { error } = await admin
      .from("matches")
      .update(patch)
      .eq("id", matchRow.id);
    if (error) {
      return {
        error: `results: ${error.message}`,
        results: 0,
        schedule: scheduleRows.length,
        lockAt: null,
      };
    }
  }
  if (resultRows.length) log.push(`applied ${resultRows.length} results`);

  const { data: lockAt, error: lockErr } = await admin.rpc("refresh_lock_at", {
    p_tournament_id: tournamentId,
  });
  if (lockErr) {
    return {
      error: `lock_at: ${lockErr.message}`,
      results: resultRows.length,
      schedule: scheduleRows.length,
      lockAt: null,
    };
  }
  if (lockAt) log.push(`lock_at ← first ball ${lockAt}`);
  else log.push("lock_at unchanged (no timed R0 ball)");

  return {
    error: null,
    results: resultRows.length,
    schedule: scheduleRows.length,
    lockAt: lockAt ?? null,
  };
}

function fail(error: unknown, log: string[]): { ok: false; error: string; log: string[] } {
  return { ok: false, error: errText(error), log };
}

/** Push a settled winner into the parent match side (idempotent). */
async function advanceWinnerIntoParentMatch(
  admin: SupabaseClient,
  tournamentId: string,
  round: number,
  indexInRound: number,
  winnerId: string
): Promise<boolean> {
  const parent = advanceWinnerToParent(round, indexInRound, winnerId);
  if (!parent) return false;
  const { data: parentRow, error } = await admin
    .from("matches")
    .select("id, side_a_player_id, side_b_player_id, winner_player_id")
    .eq("tournament_id", tournamentId)
    .eq("round", parent.round)
    .eq("index_in_round", parent.indexInRound)
    .maybeSingle();
  if (error || !parentRow) return false;
  const col = parent.sideColumn as "side_a_player_id" | "side_b_player_id";
  const current = parentRow[col];
  if (current === winnerId) return false;
  if (current && parentRow.winner_player_id) return false;
  const { error: upErr } = await admin
    .from("matches")
    .update({ [col]: winnerId })
    .eq("id", parentRow.id);
  return !upErr;
}

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
