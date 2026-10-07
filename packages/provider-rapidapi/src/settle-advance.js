/**
 * Bind archive/live results to bracket matches by player pair (+ optional round),
 * and compute parent advance targets.
 */

import { matchKey } from "./settle-keys.js";
import { outcomeDisposition } from "./normalize.js";

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

function occupantIds(m) {
  const a =
    m.side_a_provider_id != null && String(m.side_a_provider_id) !== ""
      ? String(m.side_a_provider_id)
      : "";
  const b =
    m.side_b_provider_id != null && String(m.side_b_provider_id) !== ""
      ? String(m.side_b_provider_id)
      : "";
  return { a, b };
}

/** One named side, one empty, and the named occupant is in the archive pair. */
function isOneSidedKnownInPair(m, p1, p2) {
  const { a, b } = occupantIds(m);
  if (a && b) return false;
  if (!a && !b) return false;
  const known = a || b;
  return known === p1 || known === p2;
}

/**
 * Stored occupants may receive this archive pair: both named sides are the
 * pair, or the single named side is one of the pair. Empty-empty is not a hit.
 */
function occupantsCompatibleWithPair(m, p1, p2) {
  if (!p1 || !p2) return false;
  const pair = new Set([p1, p2]);
  const { a, b } = occupantIds(m);
  if (a && b) return pair.has(a) && pair.has(b);
  if (a) return pair.has(a);
  if (b) return pair.has(b);
  return false;
}

/** True when a stored id looks like a real archive id (not fx/synthetic short). */
function looksCanonicalProviderId(raw) {
  const id = String(raw || "").trim();
  if (!id) return false;
  if (/^fx-/i.test(id)) return false;
  // Synthetic short fixture stubs: "802", "812", …
  if (/^\d{1,4}$/.test(id)) return false;
  return true;
}

/**
 * Stored id may receive this archive row: empty, a non-canonical stub, or
 * the same id. A different canonical id belongs to another match.
 */
function storedIdCompatible(stored, archiveId) {
  const current = String(stored || "").trim();
  if (!current) return true;
  if (!looksCanonicalProviderId(current)) return true;
  return current === String(archiveId || "").trim();
}

/**
 * Later-round one-sided candidate. R0 is never a partial target.
 * Occupant must be in the pair, and a foreign canonical provider_match_id
 * excludes the row.
 */
function isValidLaterPartial(m, p1, p2, archiveId) {
  if (!(Number(m.round) > 0)) return false;
  if (!isOneSidedKnownInPair(m, p1, p2)) return false;
  return storedIdCompatible(m.provider_match_id, archiveId);
}

/**
 * Map provider result rows onto match_keys using side player provider ids.
 *
 * Order: full pair (+ round / earliest), then exactly one valid later-round
 * one-sided partial. R0 is not a partial target. A later-round row whose
 * provider_match_id is a different canonical id is not a candidate. Zero
 * valid later-round candidates stay unbound (an R0 row that already holds
 * the archive id does not claim it). Two or more valid later-round
 * candidates fail closed. Occupant-compatible provider_match_id is only a
 * fallback for round > 0.
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
    const p1 = row.player1Id != null ? String(row.player1Id) : "";
    const p2 = row.player2Id != null ? String(row.player2Id) : "";

    // Prefer player-pair (+ round) over provider_match_id — local rows often
    // carry stale/synthetic ids that must not win the bind.
    let target = null;
    let boundBy = null;

    if (p1 && p2) {
      const candidates = byPair.get(pairKey(p1, p2)) || [];
      if (candidates.length === 1) {
        target = candidates[0];
        boundBy = "pair";
      } else if (candidates.length > 1) {
        const roundHint = row.roundId != null ? Number(row.roundId) : null;
        const narrowed =
          roundHint != null
            ? candidates.filter(
                (c) => c.round === roundHint - 1 || c.round === roundHint
              )
            : candidates;
        if (narrowed.length === 1) {
          target = narrowed[0];
          boundBy = "pair+round";
        } else {
          const sorted = [...candidates].sort((a, b) => a.round - b.round);
          target = sorted[0] || null;
          if (target) boundBy = "pair+earliest";
        }
      }
    }

    // Later-round partial only. R0 one-sided rows are not candidates, even
    // when they already store this archive id. A foreign canonical id on a
    // later-round row excludes it. Two valid hits fail closed.
    if (!target && p1 && p2) {
      const laterPartials = matchSides.filter((m) =>
        isValidLaterPartial(m, p1, p2, id)
      );
      if (laterPartials.length === 1) {
        target = laterPartials[0];
        boundBy = "partial";
      } else if (laterPartials.length > 1) {
        skipped.push({
          id: id || pairKey(p1, p2),
          reason: "ambiguous later-round partial",
        });
        continue;
      }
    }

    // Canonical id fallback for a later-round row whose occupants can take
    // this pair. Never an R0 one-sided row that is holding a stolen id.
    if (!target && id && looksCanonicalProviderId(id)) {
      const byId = byProviderMatch.get(id) || null;
      if (
        byId &&
        Number(byId.round) > 0 &&
        occupantsCompatibleWithPair(byId, p1, p2) &&
        storedIdCompatible(byId.provider_match_id, id)
      ) {
        target = byId;
        boundBy = "provider_match_id";
      }
    }

    if (!target) {
      skipped.push({
        id: id || pairKey(p1, p2),
        reason: "no match_key mapping",
      });
      continue;
    }

    // Rewrite whenever archive id differs from stored (including synthetic stubs).
    if (id && String(target.provider_match_id || "") !== id) {
      bindings.push({
        match_key: target.match_key,
        provider_match_id: id,
        side_a_provider_id: p1 || null,
        side_b_provider_id: p2 || null,
        bound_by: boundBy,
      });
    }

    const disposition = outcomeDisposition(row.result_type);
    if (disposition.kind === "unknown") {
      skipped.push({ id: id || target.match_key, reason: "unknown outcome" });
      continue;
    }
    if (disposition.kind === "skip") {
      skipped.push({
        id: id || target.match_key,
        reason: "non-terminal outcome",
      });
      continue;
    }

    const winnerId =
      row.match_winner != null && row.match_winner !== ""
        ? String(row.match_winner)
        : null;

    if (disposition.kind === "void" || (!winnerId && disposition.voided)) {
      results.push({
        match_key: target.match_key,
        winner_ref: null,
        winner_provider_id: null,
        voided: true,
        provider_match_id: id || undefined,
      });
      continue;
    }

    if (!winnerId) {
      const rt = String(row.result_type || "").toLowerCase();
      const voidWithoutWinner =
        disposition.kind === "void" ||
        rt === "walkover" ||
        rt === "wo" ||
        rt === "default" ||
        rt === "cancelled" ||
        rt === "canceled" ||
        !row.result;
      if (voidWithoutWinner) {
        results.push({
          match_key: target.match_key,
          winner_ref: null,
          winner_provider_id: null,
          voided: true,
          provider_match_id: id || undefined,
        });
        continue;
      }
      skipped.push({
        id: id || target.match_key,
        reason: "finished but no match_winner",
      });
      continue;
    }

    const winnerRef = players[winnerId] || winnerId;
    results.push({
      match_key: target.match_key,
      winner_ref: winnerRef,
      winner_provider_id: winnerId,
      voided: false,
      provider_match_id: id || undefined,
    });
  }

  return { results, skipped, bindings };
}

/**
 * Optional archive-row allow-list.
 * `null` / omitted keeps every row. An array keeps only those provider match ids.
 * Ids that are not in `rows` match nothing and are ignored.
 *
 * @param {Array<{ id?: string|number|null }>} rows
 * @param {Array<string|number>|null|undefined} [allowIds]
 */
export function selectArchiveRows(rows, allowIds) {
  const list = Array.isArray(rows) ? rows : [];
  if (allowIds == null) return list;
  const allow = new Set(
    (Array.isArray(allowIds) ? allowIds : [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
  );
  return list.filter((row) => allow.has(String(row?.id ?? "").trim()));
}

/**
 * Full draw reconciliation persists every fixture and archive pair id.
 * `null` / omitted keeps that path. A present allow-list skips it entirely.
 * Filtering archive rows while still indexing fixtures is not isolation.
 *
 * @param {Array<string|number>|null|undefined} providerMatchIds
 */
export function shouldReconcileDraw(providerMatchIds) {
  return providerMatchIds == null;
}

/**
 * Provider-match ids the draw path may write.
 * An allow-list yields an empty map so unrelated ids cannot be persisted.
 *
 * @param {Array<string|number>|null|undefined} providerMatchIds
 * @param {Record<string, string>|null|undefined} fullDrawMatches
 * @returns {Record<string, string>}
 */
export function drawProviderMatchWrites(providerMatchIds, fullDrawMatches) {
  if (!shouldReconcileDraw(providerMatchIds)) return {};
  if (!fullDrawMatches || typeof fullDrawMatches !== "object") return {};
  return fullDrawMatches;
}

/** Only the provider id. Winner, sides, and settled_at stay on the old holder. */
export function providerMatchReleasePatch() {
  return { provider_match_id: null };
}

/**
 * Clear-then-set for one emitted binding.
 * No binding releases nothing and assigns nothing. A release patch never
 * carries winner, sides, or settled_at. Any other row holding this id is
 * released, whatever its round.
 *
 * @param {{ match_key?: string, provider_match_id?: string|number }|null|undefined} binding
 * @param {Array<{
 *   match_key?: string,
 *   provider_match_id?: string|null,
 * }>|null|undefined} matchSides
 */
export function planProviderMatchRelocation(binding, matchSides) {
  const id = String(binding?.provider_match_id ?? "").trim();
  const key = String(binding?.match_key ?? "").trim();
  if (!binding || !id || !key) return { releases: [], assign: null };
  const releases = [];
  for (const row of Array.isArray(matchSides) ? matchSides : []) {
    if (String(row?.match_key || "") === key) continue;
    if (String(row?.provider_match_id ?? "").trim() !== id) continue;
    releases.push({
      match_key: String(row.match_key),
      patch: providerMatchReleasePatch(),
    });
  }
  return {
    releases,
    assign: { match_key: key, patch: { provider_match_id: id } },
  };
}
