/**
 * Deterministic replay into live_match_state.
 * Raw frames go through acceptForwardedLive, the listener entry:
 * raw archive, then ingestLiveFrames (normalize, map, monotonic upsert).
 * The in-memory admin is the store double for upsert_live_match_state
 * (supabase/migrations/0037_live_monotonic_upsert.sql). It does not project.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { capturedTournamentId, parseMatchId } from "./live.js";
import { normalizePairKey } from "./event-mapper.js";
import { liveRowsFromNdjson } from "./live-frame.js";
import { walkReplayClock } from "./live-replay-clock.js";

export const PROTOTYPE_TIMELINE = "fixtures/prototype-timeline.json";

/** Gitignored M1 captures. Both tours are in each file. */
export const M1_CAPTURE_FILES = [
  "captures/live-raw.ndjson",
  "fixtures/live-capture-oct-2026/frames.ndjson",
];

/**
 * node:test `skip` value for tests that read the M1 captures.
 * A fresh clone (CI) has no captures, so those tests skip with a reason.
 * @param {string} root repository root
 * @returns {string | false}
 */
export function m1CaptureSkip(root) {
  const missing = M1_CAPTURE_FILES.filter((rel) => !existsSync(path.join(root, rel)));
  return missing.length ? `gitignored M1 capture not on disk: ${missing.join(", ")}` : false;
}

const TABLES = [
  "tournaments",
  "matches",
  "players",
  "event_map",
  "platform_events",
  "unmapped_live_events",
  "ops_events",
  "listener_health",
  "live_match_state",
];

/**
 * @param {string} filePath
 * @returns {Record<string, unknown>[]}
 */
export function readReplayFrames(filePath) {
  const text = readFileSync(filePath, "utf8");
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("replay JSON must be an array of raw events");
    return parsed.filter((row) => row && typeof row === "object");
  }
  return liveRowsFromNdjson(text);
}

/**
 * @param {{ matches?: Array<Record<string, unknown>> }} catalog
 * @param {Record<string, unknown>[]} frames
 */
export function catalogCoversFrames(catalog, frames) {
  const ids = new Set(
    (catalog?.matches || []).map((match) => String(match.tournament_provider_id))
  );
  return frames.some((frame) => {
    const id = capturedTournamentId(frame);
    return id != null && ids.has(String(id));
  });
}

function query(rows) {
  let current = Promise.resolve(rows.map((row) => ({ ...row })));
  const builder = {
    select() {
      return builder;
    },
    eq(column, value) {
      current = current.then((list) =>
        list.filter((row) => String(row[column]) === String(value))
      );
      return builder;
    },
    in(column, values) {
      const allowed = new Set((values || []).map((value) => String(value)));
      current = current.then((list) =>
        list.filter((row) => allowed.has(String(row[column])))
      );
      return builder;
    },
    then(resolve, reject) {
      return current.then((data) => ({ data, error: null })).then(resolve, reject);
    },
  };
  return builder;
}

function sameInstant(left, right) {
  const a = Date.parse(String(left));
  const b = Date.parse(String(right));
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function earlierOrEqual(next, prev) {
  const a = Date.parse(String(next));
  const b = Date.parse(String(prev));
  return Number.isFinite(a) && Number.isFinite(b) && a <= b;
}

/**
 * Store predicate from upsert_live_match_state. Returns the RPC status text.
 * @param {Record<string, unknown>[]} table
 * @param {Record<string, unknown>} args
 */
export function applyLiveUpsert(table, args) {
  const phase = args.p_phase;
  const source = args.p_sequence_source;
  const origin = args.p_source;
  const serving = args.p_serving_side;
  if (phase !== "in_play" && phase !== "suspended" && phase !== "provisional_final") {
    return "ignored";
  }
  if (source !== "seq" && source !== "updatedAt" && source !== "receivedAt") return "ignored";
  if (origin !== "rest" && origin !== "socket" && origin !== "replay") return "ignored";
  if (serving != null && serving !== "a" && serving !== "b") return "ignored";
  if (source === "updatedAt" && args.p_occurred_at == null) return "ignored";

  const score = typeof args.p_score_text === "string" ? args.p_score_text : "";
  const points = typeof args.p_points_text === "string" ? args.p_points_text : "";
  const sets = /^([0-9]+-[0-9]+)(,[0-9]+-[0-9]+)*$/.test(score) ? score : null;
  const game = /^(0|15|30|40|AD)-(0|15|30|40|AD)$/.test(points) ? points : null;
  const flag = phase === "in_play" ? "live" : phase === "provisional_final" ? "provisional" : null;
  const occurred = source === "updatedAt" ? args.p_occurred_at ?? null : null;
  const index = table.findIndex((row) => row.match_id === args.p_match_id);
  if (index < 0) {
    table.push({
      match_id: args.p_match_id,
      tournament_id: args.p_tournament_id,
      public_ref: args.p_public_ref,
      phase,
      score_text: sets,
      points_text: game,
      serving_side: serving ?? null,
      provisional_winner_ref: args.p_provisional_winner_ref ?? null,
      flag,
      stats: null,
      sequence: args.p_sequence,
      sequence_source: source,
      frame_key: args.p_frame_key,
      source: origin,
      received_at: args.p_received_at,
      occurred_at: occurred,
    });
    return "applied";
  }

  const prev = table[index];
  let clockNewer = false;
  if (prev.occurred_at != null && occurred != null) {
    if (sameInstant(occurred, prev.occurred_at) || earlierOrEqual(occurred, prev.occurred_at)) {
      return "ignored";
    }
    clockNewer = true;
  }
  if (!clockNewer) {
    const rank = { seq: 3, updatedAt: 2, receivedAt: 1 };
    if (prev.sequence_source !== source || rank[prev.sequence_source] !== rank[source]) {
      return "ignored";
    }
    if (args.p_sequence < prev.sequence) return "ignored";
    if (args.p_sequence === prev.sequence) {
      if (args.p_frame_key === prev.frame_key) return "duplicate";
      return "ignored";
    }
  }
  table[index] = {
    ...prev,
    tournament_id: args.p_tournament_id,
    public_ref: args.p_public_ref,
    phase,
    score_text: sets,
    points_text: game,
    serving_side: serving ?? null,
    provisional_winner_ref: args.p_provisional_winner_ref ?? null,
    flag,
    stats: null,
    sequence: args.p_sequence,
    sequence_source: source,
    frame_key: args.p_frame_key,
    source: origin,
    received_at: args.p_received_at,
    occurred_at: occurred,
  };
  return "applied";
}

/** In-memory service-role client for the tables ingest reads and writes. */
export function createReplayAdmin() {
  /** @type {Record<string, Record<string, unknown>[]>} */
  const tables = Object.fromEntries(TABLES.map((name) => [name, []]));
  return {
    tables,
    from(tableName) {
      const bucket = tables[tableName];
      if (!bucket) throw new Error(`unknown table ${tableName}`);
      return {
        select() {
          return query(bucket);
        },
        insert(payload) {
          const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ ...row }));
          bucket.push(...rows);
          return Promise.resolve({ data: rows, error: null });
        },
        upsert(payload, options = {}) {
          const rows = Array.isArray(payload) ? payload : [payload];
          const conflict = options.onConflict;
          const written = [];
          for (const row of rows) {
            const copy = { ...row };
            const at = conflict
              ? bucket.findIndex((item) => item[conflict] === copy[conflict])
              : -1;
            if (at >= 0) {
              if (options.ignoreDuplicates) continue;
              bucket[at] = { ...bucket[at], ...copy };
              written.push(bucket[at]);
            } else {
              bucket.push(copy);
              written.push(copy);
            }
          }
          const result = Promise.resolve({
            data: written.map((row) => ({ ...row })),
            error: null,
          });
          return {
            select() {
              return result;
            },
            then(resolve, reject) {
              return result.then(resolve, reject);
            },
          };
        },
      };
    },
    rpc(name, args) {
      if (name !== "upsert_live_match_state") {
        return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
      }
      return Promise.resolve({
        data: applyLiveUpsert(tables.live_match_state, args),
        error: null,
      });
    },
  };
}

function roundIndex(matchKey) {
  const match = String(matchKey || "").match(/^r(\d+)-m(\d+)$/);
  if (!match) return { round: 0, index: 0 };
  return { round: Number(match[1]), index: Number(match[2]) };
}

function ensurePlayer(admin, providerId) {
  if (providerId == null || providerId === "") return null;
  const id = `pl-${providerId}`;
  if (!admin.tables.players.some((row) => row.id === id)) {
    admin.tables.players.push({ id, provider_id: String(providerId) });
  }
  return id;
}

function ensureTournament(admin, providerId) {
  const existing = admin.tables.tournaments.find(
    (row) => String(row.provider_id) === String(providerId)
  );
  if (existing) return existing;
  const row = {
    id: `ev-${providerId}`,
    slug: `evt-${providerId}`,
    provider_id: String(providerId),
    ingestion_enabled: true,
  };
  admin.tables.tournaments.push(row);
  return row;
}

/**
 * Seed the file catalog the way ingest reads matches: player provider ids
 * become the side refs inside ingestLiveFrames.
 * @param {ReturnType<typeof createReplayAdmin>} admin
 * @param {{ matches?: Array<Record<string, unknown>>, eventMap?: Array<Record<string, unknown>> }} catalog
 */
export function seedReplayCatalog(admin, catalog) {
  for (const match of catalog.matches || []) {
    const providerId = String(match.tournament_provider_id);
    const event = ensureTournament(admin, providerId);
    if (match.tournament_id) event.id = String(match.tournament_id);
    const sideA = ensurePlayer(admin, match.side_a_provider_id);
    const sideB = ensurePlayer(admin, match.side_b_provider_id);
    const place = roundIndex(match.match_key);
    if (admin.tables.matches.some((row) => row.id === match.match_id)) continue;
    admin.tables.matches.push({
      id: match.match_id,
      tournament_id: event.id,
      round: place.round,
      index_in_round: place.index,
      provider_match_id: match.provider_match_id ?? null,
      side_a_player_id: sideA,
      side_b_player_id: sideB,
      voided: false,
      settled_at: match.officially_settled ? "2026-10-09T00:00:00.000Z" : null,
      official_score: match.official_score ?? null,
      external_ref: match.public_ref,
    });
  }
  for (const row of catalog.eventMap || []) {
    const match = (catalog.matches || []).find((item) => item.match_id === row.match_id);
    admin.tables.event_map.push({
      tournament_id: match ? String(match.tournament_id) : null,
      match_id: row.match_id,
      socket_event_id: row.socket_event_id,
      status: row.status,
    });
  }
}

/**
 * One match per captured player pair. Live ids are not inserted as socket ids.
 * @param {ReturnType<typeof createReplayAdmin>} admin
 * @param {Record<string, unknown>[]} frames
 */
export function seedCapturedPairs(admin, frames) {
  /** @type {Map<string, { tournamentId: string, player1Id: string, player2Id: string, pair: string }>} */
  const pairs = new Map();
  for (const frame of frames) {
    const tournamentId = capturedTournamentId(frame);
    const parsed = parseMatchId(frame.matchId);
    if (!tournamentId || !parsed?.player1Id || !parsed.player2Id) continue;
    const pair = normalizePairKey(parsed.player1Id, parsed.player2Id);
    const key = `${tournamentId}|${pair}`;
    if (!pairs.has(key)) {
      pairs.set(key, {
        tournamentId: String(tournamentId),
        player1Id: String(parsed.player1Id),
        player2Id: String(parsed.player2Id),
        pair,
      });
    }
  }
  const ordered = [...pairs.values()].sort((left, right) => {
    if (left.tournamentId !== right.tournamentId) {
      return left.tournamentId < right.tournamentId ? -1 : 1;
    }
    return left.pair < right.pair ? -1 : left.pair > right.pair ? 1 : 0;
  });
  /** @type {Map<string, number>} */
  const index = new Map();
  for (const row of ordered) {
    const event = ensureTournament(admin, row.tournamentId);
    const at = index.get(row.tournamentId) ?? 0;
    index.set(row.tournamentId, at + 1);
    const sideA = ensurePlayer(admin, row.player1Id);
    const sideB = ensurePlayer(admin, row.player2Id);
    const id = `m-${row.tournamentId}-${row.pair}`;
    if (admin.tables.matches.some((match) => match.id === id)) continue;
    admin.tables.matches.push({
      id,
      tournament_id: event.id,
      round: 0,
      index_in_round: at,
      provider_match_id: null,
      side_a_player_id: sideA,
      side_b_player_id: sideB,
      voided: false,
      settled_at: null,
      official_score: null,
      external_ref: id,
    });
  }
}

/**
 * @param {ReturnType<typeof createReplayAdmin>} admin
 */
export function liveRows(admin) {
  return admin.tables.live_match_state.map((row) => ({ ...row }));
}

/**
 * Production path: acceptForwardedLive → ingestLiveFrames → live_match_state.
 * @param {ReturnType<typeof createReplayAdmin>} admin
 * @param {Record<string, unknown>[]} frames
 * @param {string[]} [log]
 */
export async function replayThroughIngest(admin, frames, log = []) {
  const clock = walkReplayClock(frames);
  const { acceptForwardedLive } = await import(
    "../../../supabase/functions/_shared/project-live.ts"
  );
  const result = await acceptForwardedLive(
    admin,
    frames,
    log,
    clock.iso ? { now: clock.iso } : undefined
  );
  return { ...result, now: clock.iso, spanMs: clock.spanMs, sleptMs: clock.sleptMs };
}
