/**
 * Provider-authoritative fixture reconcile helpers (Sprint Directive 2.1 §2.1).
 * Domain is the provider result set — not stored rows.
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
    });
  }
  return unbound;
}
