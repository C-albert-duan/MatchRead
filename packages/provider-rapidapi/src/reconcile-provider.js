/**
 * Provider-authoritative fixture reconcile helpers (Sprint Directive 2.1 §2.1).
 * Domain is the provider result set — not stored rows.
 * Shape B (CEO Aug 24): missing local match / empty sides healed from results archive
 * + official seats — never invent slots without a seat pair.
 */

/**
 * @param {Array<{ id?: string|number|null }>} providerRows
 * @param {Array<{ id: string, provider_match_id?: string|null, match_key?: string }>} storedMatches
 */
export function diffProviderAuthoritative(providerRows, storedMatches) {
  const providerIds = new Set();
  for (const row of Array.isArray(providerRows) ? providerRows : []) {
    if (row?.id != null && String(row.id).trim() !== "") {
      providerIds.add(String(row.id));
    }
  }

  const storedByProvider = new Map();
  for (const m of Array.isArray(storedMatches) ? storedMatches : []) {
    if (m.provider_match_id) {
      storedByProvider.set(String(m.provider_match_id), m);
    }
  }

  const missingFromStore = [];
  for (const id of providerIds) {
    if (!storedByProvider.has(id)) missingFromStore.push(id);
  }

  const orphans = [];
  for (const [id, m] of storedByProvider) {
    if (!providerIds.has(id)) {
      orphans.push({
        match_id: m.id,
        provider_match_id: id,
        match_key: m.match_key ?? null,
      });
    }
  }

  return {
    providerCount: providerIds.size,
    missingFromStore,
    orphans,
  };
}

/**
 * Merge unbound provider rows that have a winner into ingest results when
 * bindResultsByPlayerPair skipped them — caller still needs a match_key.
 * Returns provider ids that remain unbound (need create / audit).
 *
 * @param {Array<{ id?: string|number, match_winner?: unknown }>} providerRows
 * @param {Array<{ match_key: string, provider_match_id?: string }>} boundResults
 * @param {Set<string>} knownProviderMatchIds
 */
export function unboundProviderFixtures(
  providerRows,
  boundResults,
  knownProviderMatchIds
) {
  const boundIds = new Set(
    (boundResults || [])
      .map((r) => (r.provider_match_id ? String(r.provider_match_id) : ""))
      .filter(Boolean)
  );
  const unbound = [];
  for (const row of Array.isArray(providerRows) ? providerRows : []) {
    const id = row?.id != null ? String(row.id) : "";
    if (!id) continue;
    if (boundIds.has(id)) continue;
    if (knownProviderMatchIds.has(id)) continue;
    const hasWinner =
      row.match_winner != null &&
      String(row.match_winner).trim() !== "" &&
      String(row.match_winner) !== "0";
    unbound.push({
      provider_match_id: id,
      has_winner: hasWinner,
      player1Id: row.player1Id != null ? String(row.player1Id) : null,
      player2Id: row.player2Id != null ? String(row.player2Id) : null,
      match_winner:
        row.match_winner != null ? String(row.match_winner) : null,
      result_type: row.result_type != null ? String(row.result_type) : null,
    });
  }
  return unbound;
}

/**
 * Map two named seat players to their R0 match slot (official pair only).
 * Fail closed if not an adjacent official pair.
 *
 * @param {Array<{ position: number, provider_player_id?: string|null }>} seats
 * @param {string} p1
 * @param {string} p2
 * @returns {{ round: number, index_in_round: number, match_key: string, side_a_provider_id: string, side_b_provider_id: string } | null}
 */
export function r0SlotFromSeatPair(seats, p1, p2) {
  const aId = String(p1 || "").trim();
  const bId = String(p2 || "").trim();
  if (!aId || !bId || aId === bId) return null;
  const posByProvider = new Map();
  for (const s of Array.isArray(seats) ? seats : []) {
    const pid = s?.provider_player_id != null ? String(s.provider_player_id) : "";
    if (!pid) continue;
    const pos = Number(s.position);
    if (!Number.isInteger(pos) || pos < 0) continue;
    posByProvider.set(pid, pos);
  }
  const posA = posByProvider.get(aId);
  const posB = posByProvider.get(bId);
  if (posA == null || posB == null) return null;
  const lo = Math.min(posA, posB);
  const hi = Math.max(posA, posB);
  if (hi !== lo + 1 || lo % 2 !== 0) return null;
  const index = lo / 2;
  return {
    round: 0,
    index_in_round: index,
    match_key: `r0-m${index}`,
    side_a_provider_id: posA < posB ? aId : bId,
    side_b_provider_id: posA < posB ? bId : aId,
  };
}

/**
 * Propose Shape B repairs: fill empty R0 sides or create missing R0 rows from
 * unbound official results whose players occupy an adjacent official seat pair.
 *
 * @param {Array<{ provider_match_id: string, has_winner: boolean, player1Id: string|null, player2Id: string|null, match_winner: string|null, result_type?: string|null }>} unbound
 * @param {Array<{ position: number, provider_player_id?: string|null }>} seats
 * @param {Array<{ match_key: string, round: number, index_in_round: number, provider_match_id?: string|null, side_a_provider_id?: string|null, side_b_provider_id?: string|null }>} matchSides
 */
export function proposeShapeBRepairs(unbound, seats, matchSides) {
  const byKey = new Map();
  for (const m of Array.isArray(matchSides) ? matchSides : []) {
    if (m?.match_key) byKey.set(String(m.match_key), m);
  }
  const repairs = [];
  for (const u of Array.isArray(unbound) ? unbound : []) {
    if (!u?.has_winner || !u.player1Id || !u.player2Id || !u.match_winner) {
      continue;
    }
    const slot = r0SlotFromSeatPair(seats, u.player1Id, u.player2Id);
    if (!slot) continue;
    const existing = byKey.get(slot.match_key);
    if (existing?.side_a_provider_id && existing?.side_b_provider_id) {
      const samePair =
        (String(existing.side_a_provider_id) === slot.side_a_provider_id &&
          String(existing.side_b_provider_id) === slot.side_b_provider_id) ||
        (String(existing.side_a_provider_id) === slot.side_b_provider_id &&
          String(existing.side_b_provider_id) === slot.side_a_provider_id);
      // Correct seat pair already on the row — bindResults owns the winner.
      if (samePair) continue;
      // Wrong sides vs official seats: propose fill so heal can overwrite.
    }
    repairs.push({
      action: existing ? "fill" : "create",
      match_key: slot.match_key,
      round: slot.round,
      index_in_round: slot.index_in_round,
      provider_match_id: String(u.provider_match_id),
      side_a_provider_id: slot.side_a_provider_id,
      side_b_provider_id: slot.side_b_provider_id,
      winner_provider_id: String(u.match_winner),
      result_type: u.result_type ?? null,
    });
  }
  return repairs;
}
