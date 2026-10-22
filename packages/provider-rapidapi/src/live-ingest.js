/**
 * Live ingestion boundary used by sync-facts.
 * Writes live_match_state only. Does not update matches.
 */
import { liveUpsertArgs, officialMatchPatch } from "./live-repository.js";
import { replayLiveFrames } from "./live-frame.js";

/**
 * Log and archive events that did not map. Does not write live_match_state or matches.
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {Array<{ log: Record<string, unknown>, archive: Record<string, unknown> }>} unknown
 * @param {string[]} [log]
 * @param {{ ops?: boolean }} [opts] `ops: false` archives the raw row and does not insert ops_events.
 */
export async function persistUnknownLive(admin, unknown, log = [], opts = {}) {
  if (!unknown?.length) return;
  for (const row of unknown) {
    log.push(JSON.stringify(row.log));
  }
  const { error: archiveError } = await admin
    .from("unmapped_live_events")
    .insert(unknown.map((row) => row.archive));
  if (archiveError) log.push(`unmapped archive skipped: ${archiveError.message}`);
  if (opts.ops === false) return;
  const { error: opsError } = await admin.from("ops_events").insert(unknown.map((row) => row.log));
  if (opsError) log.push(`unmapped log skipped: ${opsError.message}`);
}

function carriedEventRecord(row, providerId) {
  const id = providerToken(providerId);
  if (!id || !row?.log) return row;
  const payload = row.log.payload && typeof row.log.payload === "object" ? row.log.payload : {};
  return {
    ...row,
    log: {
      ...row.log,
      payload: { ...payload, provider_tournament_id: id },
    },
  };
}

function providerToken(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || /\s/.test(text)) return null;
  return text;
}

function missingLiveStore(message) {
  return /upsert_live_match_state|live_match_state|does not exist|schema cache|Could not find the function/i.test(
    message
  );
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {{ id: string, provider_id: string, slug: string }} event
 * @param {unknown[]} liveEvents
 * @param {{ dryRun?: boolean, log?: string[], now?: string }} [opts]
 * `now` is the replay clock. Production omits it and stamps health with the wall clock.
 */
export async function ingestLiveFrames(admin, event, liveEvents, opts = {}) {
  const log = opts.log ?? [];
  const dryRun = Boolean(opts.dryRun);
  const stampedAt =
    typeof opts.now === "string" && opts.now ? opts.now : new Date().toISOString();
  const empty = {
    applied: 0,
    duplicate: 0,
    ignored: 0,
    unmapped: 0,
    ambiguous: 0,
    disagreements: 0,
  };
  if (!liveEvents.length) return empty;

  const { data: matchRows, error: matchError } = await admin
    .from("matches")
    .select(
      "id, round, index_in_round, provider_match_id, side_a_player_id, side_b_player_id, winner_player_id, voided, settled_at, official_score, external_ref"
    )
    .eq("tournament_id", event.id);
  if (matchError) {
    log.push(`live branch read failed: ${matchError.message}`);
    return empty;
  }

  const playerIds = [
    ...new Set(
      (matchRows ?? [])
        .flatMap((row) => [row.side_a_player_id, row.side_b_player_id, row.winner_player_id])
        .filter(Boolean)
    ),
  ];
  const providerByUuid = new Map();
  if (playerIds.length) {
    const { data: people } = await admin
      .from("players")
      .select("id, provider_id")
      .in("id", playerIds);
    for (const person of people ?? []) {
      if (person.provider_id) providerByUuid.set(String(person.id), String(person.provider_id));
    }
  }

  const { data: mapped } = await admin
    .from("event_map")
    .select("match_id, socket_event_id, status")
    .eq("tournament_id", event.id);

  const matches = (matchRows ?? [])
    .filter((row) => row.external_ref)
    .map((row) => {
      const sideA = row.side_a_player_id
        ? providerByUuid.get(String(row.side_a_player_id)) ?? null
        : null;
      const sideB = row.side_b_player_id
        ? providerByUuid.get(String(row.side_b_player_id)) ?? null
        : null;
      const winner = row.winner_player_id
        ? providerByUuid.get(String(row.winner_player_id)) ?? null
        : null;
      return {
        match_id: row.id,
        match_key: `r${row.round}-m${row.index_in_round}`,
        public_ref: row.external_ref,
        tournament_id: event.id,
        tournament_provider_id: event.provider_id,
        provider_match_id: row.provider_match_id,
        side_a_provider_id: sideA,
        side_b_provider_id: sideB,
        side_a_ref: sideA,
        side_b_ref: sideB,
        officially_settled: Boolean(row.settled_at || row.winner_player_id || row.voided),
        official_score: row.official_score,
        winner_ref: winner,
      };
    });

  const replay = replayLiveFrames(liveEvents, {
    matches,
    eventMap: mapped ?? [],
  });
  const health = {
    applied: 0,
    duplicate: 0,
    ignored: replay.health.ignored,
    unmapped: replay.health.unmapped,
    ambiguous: replay.health.ambiguous,
    disagreements: replay.disagreements.length,
  };

  if (!dryRun && replay.unknown.length) {
    await persistUnknownLive(
      admin,
      replay.unknown.map((row) => carriedEventRecord(row, event.provider_id)),
      log
    );
  }

  if (!dryRun && replay.disagreements.length) {
    const { error } = await admin.from("ops_events").insert(replay.disagreements);
    if (error) throw new Error(`live disagreement not recorded: ${error.message}`);
  }

  if (officialMatchPatch({ status: "live" }) !== null) {
    throw new Error("live ingestion does not write matches");
  }

  if (!dryRun) {
    for (const state of replay.states) {
      const { data, error } = await admin.rpc("upsert_live_match_state", liveUpsertArgs(state));
      if (error) {
        if (missingLiveStore(error.message)) {
          log.push("live branch skipped: upsert_live_match_state is not deployed");
          break;
        }
        log.push(`live upsert failed: ${error.message}`);
        health.ignored += 1;
        continue;
      }
      if (data === "applied") health.applied += 1;
      else if (data === "duplicate") health.duplicate += 1;
      else health.ignored += 1;
    }
    const { error: healthError } = await admin.from("listener_health").upsert(
      {
        id: "sync-facts",
        transport: "rest",
        connection: "idle",
        last_frame_at: replay.states.at(-1)?.received_at ?? null,
        last_error: null,
        frames_applied: health.applied,
        frames_duplicate: health.duplicate,
        frames_ignored: health.ignored,
        frames_unmapped: health.unmapped,
        frames_ambiguous: health.ambiguous,
        frames_disagreement: health.disagreements,
        updated_at: stampedAt,
      },
      { onConflict: "id" }
    );
    if (healthError) log.push(`listener health: ${healthError.message}`);
  } else {
    health.applied = replay.health.applied;
    health.duplicate = replay.health.duplicate;
    health.ignored = replay.health.ignored;
  }

  log.push(
    `${event.slug} live branch applied=${health.applied} duplicate=${health.duplicate} ignored=${health.ignored} unmapped=${health.unmapped} disagreements=${health.disagreements}`
  );
  return health;
}
