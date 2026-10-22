/**
 * Live-list id → internal match.
 * Captures showed fixture id ≠ live id, and no socket event id.
 * A row maps only when tourType, the matchId tournament segment, and the
 * two matchId player segments pick exactly one match. Names are ignored.
 */
import { parseMatchId } from "./live.js";
import { normalizePairKey } from "./event-mapper.js";

/**
 * @param {unknown[]} liveRows
 * @param {Array<{
 *   match_id: string,
 *   tour: string,
 *   tournament_provider_id: string,
 *   side_a_provider_id: string | null,
 *   side_b_provider_id: string | null,
 * }>} matches
 */
export function planProviderEventMap(liveRows, matches) {
  /** @type {Map<string, string[]>} */
  const byPair = new Map();
  for (const match of matches) {
    if (match.tour !== "atp" && match.tour !== "wta") continue;
    const tournamentId = text(match.tournament_provider_id);
    const sideA = text(match.side_a_provider_id);
    const sideB = text(match.side_b_provider_id);
    const matchId = text(match.match_id);
    if (!tournamentId || !sideA || !sideB || !matchId) continue;
    const key = `${match.tour}|${tournamentId}|${normalizePairKey(sideA, sideB)}`;
    const list = byPair.get(key) ?? [];
    list.push(matchId);
    byPair.set(key, list);
  }

  const unmapped = {
    tour: 0,
    id: 0,
    matchId: 0,
    not_found: 0,
    ambiguous_match: 0,
    ambiguous_event: 0,
  };
  /** @type {Map<string, { tour: "atp" | "wta", provider_event_id: string, match_id: string } | null>} */
  const planned = new Map();

  for (const row of Array.isArray(liveRows) ? liveRows : []) {
    if (!row || typeof row !== "object") {
      unmapped.matchId += 1;
      continue;
    }
    const record = /** @type {Record<string, unknown>} */ (row);
    const tour = record.tourType;
    if (tour !== "atp" && tour !== "wta") {
      unmapped.tour += 1;
      continue;
    }
    const eventId = text(record.id);
    if (!eventId) {
      unmapped.id += 1;
      continue;
    }
    const parsed = parseMatchId(record.matchId);
    if (!parsed?.player1Id || !parsed?.player2Id || !parsed?.tournamentId) {
      unmapped.matchId += 1;
      continue;
    }
    const key = `${tour}|${parsed.tournamentId}|${normalizePairKey(parsed.player1Id, parsed.player2Id)}`;
    const hits = [...new Set(byPair.get(key) ?? [])];
    if (hits.length !== 1) {
      if (hits.length === 0) unmapped.not_found += 1;
      else unmapped.ambiguous_match += 1;
      continue;
    }
    const mapKey = `${tour}|${eventId}`;
    const next = { tour, provider_event_id: eventId, match_id: hits[0] };
    const prev = planned.get(mapKey);
    if (prev === undefined) {
      planned.set(mapKey, next);
      continue;
    }
    if (prev && prev.match_id !== next.match_id) {
      planned.set(mapKey, null);
      unmapped.ambiguous_event += 1;
    }
  }

  const rows = [];
  for (const value of planned.values()) {
    if (value) rows.push(value);
  }
  return { rows, unmapped };
}

/**
 * @param {unknown} value
 */
function text(value) {
  if (value == null) return "";
  return String(value).trim();
}
