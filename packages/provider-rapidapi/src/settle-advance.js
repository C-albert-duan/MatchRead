/**
 * Bind archive/live results to bracket matches by player pair (+ optional round),
 * and compute parent advance targets.
 */

import { matchKey } from "./settle-keys.js";

export function parentMatchKey(round, indexInRound) {
  return {
    round: round + 1,
    indexInRound: Math.floor(indexInRound / 2),
    side: indexInRound % 2 === 0 ? "a" : "b",
    key: matchKey(round + 1, Math.floor(indexInRound / 2)),
  };
}

export function advanceWinnerToParent(round, indexInRound, winnerPlayerId) {
  if (winnerPlayerId == null) return null;
  const parent = parentMatchKey(round, indexInRound);
  return {
    ...parent,
    winnerPlayerId,
    sideColumn:
      parent.side === "a" ? "side_a_player_id" : "side_b_player_id",
  };
}

function pairKey(a, b) {
  const x = String(a);
  const y = String(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

/**
 * Map provider result rows onto match_keys using side player provider ids.
 *
 * @param {Array<{
 *   id?: string|number,
 *   player1Id?: string|number,
 *   player2Id?: string|number,
 *   match_winner?: string|number|null,
 *   result_type?: string,
 *   roundId?: number|null,
 * }>} rows
 * @param {Array<{
 *   match_key: string,
 *   round: number,
 *   index_in_round: number,
 *   side_a_provider_id: string|null,
 *   side_b_provider_id: string|null,
 *   provider_match_id?: string|null,
 * }>} matchSides
 * @param {Record<string, string>} players provider_id → winner_ref (uuid or legacy)
 */
export function bindResultsByPlayerPair(rows, matchSides, players = {}) {
  const byPair = new Map();
  for (const m of matchSides) {
    if (!m.side_a_provider_id || !m.side_b_provider_id) continue;
    const key = pairKey(m.side_a_provider_id, m.side_b_provider_id);
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(m);
  }

  const byProviderMatch = new Map();
  for (const m of matchSides) {
    if (m.provider_match_id) {
      byProviderMatch.set(String(m.provider_match_id), m);
    }
  }

  const results = [];
  const skipped = [];
  const bindings = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row.id ?? "").trim();
    let target = id ? byProviderMatch.get(id) : null;

    const p1 = row.player1Id != null ? String(row.player1Id) : "";
    const p2 = row.player2Id != null ? String(row.player2Id) : "";
    if (!target && p1 && p2) {
      const candidates = byPair.get(pairKey(p1, p2)) || [];
      if (candidates.length === 1) target = candidates[0];
      else if (candidates.length > 1) {
        const roundHint = row.roundId != null ? Number(row.roundId) : null;
        const narrowed =
          roundHint != null
            ? candidates.filter((c) => c.round === roundHint - 1 || c.round === roundHint)
            : candidates;
        if (narrowed.length === 1) target = narrowed[0];
        else {
          // Prefer earliest unsettled-looking round (lowest round index)
          const sorted = [...candidates].sort((a, b) => a.round - b.round);
          target = sorted[0] || null;
        }
      }
    }

    if (!target) {
      skipped.push({ id: id || pairKey(p1, p2), reason: "no match_key mapping" });
      continue;
    }

    if (id && !target.provider_match_id) {
      bindings.push({
        match_key: target.match_key,
        provider_match_id: id,
      });
    }

    const resultType = String(row.result_type || "").toLowerCase();
    const voidLike =
      resultType === "walkover" ||
      resultType === "default" ||
      resultType === "cancelled" ||
      resultType === "canceled";

    const winnerId =
      row.match_winner != null && row.match_winner !== ""
        ? String(row.match_winner)
        : null;

    if (!winnerId) {
      if (voidLike || !row.result) {
        results.push({
          match_key: target.match_key,
          winner_ref: null,
          winner_provider_id: null,
          voided: true,
        });
      } else {
        skipped.push({ id: id || target.match_key, reason: "finished but no match_winner" });
      }
      continue;
    }

    const winnerRef = players[winnerId] || winnerId;
    results.push({
      match_key: target.match_key,
      winner_ref: winnerRef,
      winner_provider_id: winnerId,
      voided: false,
    });
  }

  return { results, skipped, bindings };
}
