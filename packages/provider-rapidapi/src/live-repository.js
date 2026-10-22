/**
 * Arguments for upsert_live_match_state.
 * The row has no official match columns.
 */
import { liveStateRow } from "./live-frame.js";

const FORBIDDEN = [
  "winner_player_id",
  "official_score",
  "settled_at",
  "voided",
  "winner_side",
];

/**
 * Columns a live frame must not write on matches.
 * `status` is included because matches has no status column, so
 * status = 'live' is not an accepted transition.
 */
const OFFICIAL_BLOCKED = [
  "status",
  "winner_side",
  "winner_player_id",
  "official_score",
  "scoreline",
  "fact_kind",
  "settled_at",
  "voided",
  "side_a_player_id",
  "side_b_player_id",
];

/**
 * The matches update live ingestion may apply.
 * The table has no status column, so this is null.
 * A provisional winner or live score is not copied onto an official column.
 * @param {Record<string, unknown>} [proposed]
 * @returns {null}
 */
export function officialMatchPatch(proposed = {}) {
  const patch = {};
  for (const [key, value] of Object.entries(proposed)) {
    if (OFFICIAL_BLOCKED.includes(key)) continue;
    if (value == null) continue;
    patch[key] = value;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * @param {Record<string, unknown>} state
 */
export function liveUpsertArgs(state) {
  const row = liveStateRow(state);
  for (const key of FORBIDDEN) {
    if (Object.hasOwn(row, key)) {
      throw new Error(`live row includes ${key}`);
    }
  }
  return {
    p_match_id: row.match_id,
    p_tournament_id: row.tournament_id,
    p_public_ref: row.public_ref,
    p_phase: row.phase,
    p_score_text: row.score_text,
    p_points_text: row.points_text,
    p_serving_side: row.serving_side,
    p_provisional_winner_ref: row.provisional_winner_ref,
    p_sequence: row.sequence,
    p_sequence_source: row.sequence_source,
    p_frame_key: row.frame_key,
    p_source: row.source,
    p_received_at: row.received_at,
    p_occurred_at: row.occurred_at ?? null,
  };
}

/**
 * One match for a live-list id on one tour. An unknown id returns null.
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string} tour
 * @param {string} providerEventId
 * @returns {Promise<string | null>}
 */
export async function findMatchByProviderEvent(admin, tour, providerEventId) {
  if (tour !== "atp" && tour !== "wta") return null;
  const id = String(providerEventId ?? "").trim();
  if (!id) return null;
  const { data, error } = await admin
    .from("provider_event_map")
    .select("match_id")
    .eq("tour", tour)
    .eq("provider_event_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.match_id ?? null;
}
