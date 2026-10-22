import { parseMatchCourt, parseMatchSession } from "./match-facts.js";
import { mergeSettledFact, officialFactKind, officialScoreText } from "./normalize.js";
import { bindResultsByPlayerPair } from "./settle-advance.js";

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
      official_score: officialScoreText(row),
      fact_kind: officialFactKind(row),
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
      official_score: u.official_score ?? null,
      fact_kind: u.fact_kind ?? null,
    });
  }
  return repairs;
}

/**
 * Plan scoreline fills from one tournament's completed-results archive.
 * Writes are score and fact class only. A winner is never part of the patch.
 * Unsettled matches are left for sync-facts.
 *
 * @param {{
 *   matches: Array<{
 *     id: string,
 *     match_key: string,
 *     round: number,
 *     index_in_round: number,
 *     provider_match_id?: string|null,
 *     side_a_provider_id?: string|null,
 *     side_b_provider_id?: string|null,
 *     settled_at?: string|null,
 *     winner_player_id?: string|null,
 *     voided?: boolean|null,
 *     official_score?: string|null,
 *     fact_kind?: string|null,
 *   }>,
 *   archiveRows?: Array<Record<string, unknown>>,
 *   players?: Record<string, string>,
 * }} input
 */
export function planScorelineBackfill(input) {
  const matches = Array.isArray(input?.matches) ? input.matches : [];
  const archiveRows = Array.isArray(input?.archiveRows) ? input.archiveRows : [];
  const players = input?.players || {};
  const sides = matches.map((m) => ({
    match_key: m.match_key,
    round: Number(m.round),
    index_in_round: Number(m.index_in_round),
    provider_match_id: m.provider_match_id ? String(m.provider_match_id) : null,
    side_a_provider_id: m.side_a_provider_id
      ? String(m.side_a_provider_id)
      : null,
    side_b_provider_id: m.side_b_provider_id
      ? String(m.side_b_provider_id)
      : null,
  }));
  const bound = bindResultsByPlayerPair(archiveRows, sides, players);
  const byKey = new Map(bound.results.map((row) => [row.match_key, row]));
  const archiveById = new Map(
    archiveRows.map((row) => [String(row?.id ?? "").trim(), row])
  );

  /** @type {Array<{ match_id: string, match_key: string, official_score?: string, fact_kind?: string }>} */
  const fills = [];
  /** @type {Array<{ kind: string, match_id: string, match_key: string, existing: unknown, incoming: unknown }>} */
  const conflicts = [];
  /** @type {Array<{ match_id: string, match_key: string }>} */
  const unchanged = [];
  /** @type {Array<{ match_id: string, match_key: string, reason: string }>} */
  const unmatchedLocal = [];
  /** @type {Array<{ match_id: string, match_key: string, reason: string, official_score: string }>} */
  const skippedUnsettled = [];

  for (const match of matches) {
    const incoming = byKey.get(match.match_key);
    const settled =
      Boolean(match.settled_at) &&
      (Boolean(match.winner_player_id) || Boolean(match.voided));
    const haveScore = Boolean(
      match.official_score && String(match.official_score).trim()
    );
    if (!incoming) {
      if (settled && !haveScore) {
        unmatchedLocal.push({
          match_id: match.id,
          match_key: match.match_key,
          reason: "no archive row",
        });
      }
      continue;
    }
    if (!settled) {
      if (incoming.official_score) {
        skippedUnsettled.push({
          match_id: match.id,
          match_key: match.match_key,
          reason: "not settled",
          official_score: incoming.official_score,
        });
      }
      continue;
    }

    const decision = mergeSettledFact(
      {
        settled_at: match.settled_at,
        winner_player_id: match.winner_player_id ?? null,
        voided: Boolean(match.voided),
        official_score: match.official_score ?? null,
        fact_kind: match.fact_kind ?? null,
      },
      {
        winner_player_id: incoming.voided ? null : incoming.winner_ref ?? null,
        voided: Boolean(incoming.voided),
        official_score: incoming.official_score ?? null,
        fact_kind: incoming.fact_kind ?? null,
      }
    );

    if (decision.conflicts.includes("winner")) {
      conflicts.push({
        kind: "winner",
        match_id: match.id,
        match_key: match.match_key,
        existing: match.winner_player_id ?? null,
        incoming: incoming.winner_ref ?? null,
      });
    }
    if (decision.conflicts.includes("score")) {
      conflicts.push({
        kind: "score",
        match_id: match.id,
        match_key: match.match_key,
        existing: match.official_score ?? null,
        incoming: incoming.official_score ?? null,
      });
    }
    if (decision.conflicts.includes("fact_kind")) {
      conflicts.push({
        kind: "fact_kind",
        match_id: match.id,
        match_key: match.match_key,
        existing: match.fact_kind ?? null,
        incoming: incoming.fact_kind ?? null,
      });
    }

    /** @type {{ official_score?: string, fact_kind?: string }} */
    const write = {};
    if (decision.patch.official_score && !decision.conflicts.includes("score")) {
      write.official_score = String(decision.patch.official_score);
    }
    if (decision.patch.fact_kind && !decision.conflicts.includes("fact_kind")) {
      write.fact_kind = String(decision.patch.fact_kind);
    }
    if (write.official_score || write.fact_kind) {
      fills.push({ match_id: match.id, match_key: match.match_key, ...write });
    } else if (
      !decision.conflicts.includes("score") &&
      !decision.conflicts.includes("fact_kind")
    ) {
      unchanged.push({ match_id: match.id, match_key: match.match_key });
    }
  }

  const unmatchedArchive = bound.skipped.map((skip) => {
    const row = archiveById.get(String(skip.id || ""));
    return {
      provider_match_id: skip.id,
      reason: skip.reason,
      official_score: officialScoreText(row),
    };
  });

  return {
    fills,
    conflicts,
    unchanged,
    unmatchedLocal,
    unmatchedArchive,
    skippedUnsettled,
  };
}

const PLACEHOLDER_PLAYER_ID = "3700";

/** @param {Set<string>} set @param {unknown} value */
function addPlayerId(set, value) {
  const id = String(value ?? "").trim();
  if (!id || id === "0" || id === PLACEHOLDER_PLAYER_ID) return;
  set.add(id);
}

/** @param {Set<string>} set @param {unknown} person */
function addPersonId(set, person) {
  if (!person || typeof person !== "object") return;
  const row = /** @type {Record<string, unknown>} */ (person);
  addPlayerId(set, row.id ?? row.playerId ?? row.provider_id);
}

/** @param {Set<string>} set @param {unknown} row */
function addRowPlayerIds(set, row) {
  if (!row || typeof row !== "object") {
    addPlayerId(set, row);
    return;
  }
  const rec = /** @type {Record<string, unknown>} */ (row);
  const matchRow =
    rec.player1Id != null ||
    rec.player_1_id != null ||
    rec.player2Id != null ||
    rec.player_2_id != null ||
    rec.player1 != null ||
    rec.player2 != null ||
    rec.match_winner != null ||
    Array.isArray(rec.competitors);
  addPlayerId(set, rec.player1Id ?? rec.player_1_id);
  addPlayerId(set, rec.player2Id ?? rec.player_2_id);
  addPlayerId(set, rec.provider_player_id ?? rec.playerId);
  addPersonId(set, rec.player1);
  addPersonId(set, rec.player2);
  if (!matchRow) addPersonId(set, rec);
  if (Array.isArray(rec.competitors)) {
    for (const person of rec.competitors) addPersonId(set, person);
  }
  if (Array.isArray(rec.players)) {
    for (const person of rec.players) addPersonId(set, person);
  }
}

/**
 * Entry list inside a tournament-info payload.
 * Null when the payload was not loaded or has no entry collection.
 * An array, including empty, means the list was read.
 * @param {unknown} info
 * @returns {unknown[]|null}
 */
export function entryRowsFromInfo(info) {
  if (info == null || typeof info !== "object") return null;
  const wrapped = /** @type {Record<string, unknown>} */ (info);
  const root =
    wrapped.info && typeof wrapped.info === "object" && !Array.isArray(wrapped.info)
      ? /** @type {Record<string, unknown>} */ (wrapped.info)
      : wrapped;
  for (const key of [
    "entries",
    "entryList",
    "entry_list",
    "acceptances",
    "players",
    "field",
  ]) {
    if (Array.isArray(root[key])) return root[key];
  }
  return null;
}

/**
 * A player missing from the local draw.
 * Withdrawal: also absent from both the fixture list and the entry list.
 * Ingestion gap: present on either upstream list.
 * Unexplained: a source was not loaded, so this is not a withdrawal.
 * Settlement stays closed while any gap or unexplained absence remains.
 *
 * @param {{
 *   seats?: Array<{ provider_player_id?: string|null, player_id?: string|null }>,
 *   archiveRows?: unknown[],
 *   fixtures?: unknown[]|null,
 *   entries?: unknown[]|null,
 * }} input
 */
export function classifyPlayerAbsences(input) {
  const local = new Set();
  for (const seat of input?.seats || []) {
    addPlayerId(local, seat?.provider_player_id ?? seat?.player_id);
  }
  const archive = new Set();
  for (const row of input?.archiveRows || []) addRowPlayerIds(archive, row);

  const fixturesChecked = Array.isArray(input?.fixtures);
  const entriesChecked = Array.isArray(input?.entries);
  const fixtureIds = new Set();
  const entryIds = new Set();
  if (fixturesChecked) {
    for (const row of input.fixtures) addRowPlayerIds(fixtureIds, row);
  }
  if (entriesChecked) {
    for (const row of input.entries) addRowPlayerIds(entryIds, row);
  }

  /** @type {string[]} */
  const withdrawal = [];
  /** @type {string[]} */
  const ingestionGap = [];
  /** @type {string[]} */
  const unexplained = [];
  const candidates = new Set([...archive, ...fixtureIds, ...entryIds]);
  for (const id of candidates) {
    if (local.has(id)) continue;
    if (fixtureIds.has(id) || entryIds.has(id)) {
      ingestionGap.push(id);
      continue;
    }
    if (fixturesChecked && entriesChecked) withdrawal.push(id);
    else unexplained.push(id);
  }
  withdrawal.sort();
  ingestionGap.sort();
  unexplained.sort();
  return {
    withdrawal,
    ingestionGap,
    unexplained,
    settleBlocked: ingestionGap.length > 0 || unexplained.length > 0,
  };
}

/**
 * Rows for a local/upstream discrepancy.
 * This repo has no S1 type. Web failures use ops_events.kind "error"
 * (Sentry level "error" only from the web app when a DSN is set).
 * A gap or an unexplained absence uses that kind. A withdrawal stays
 * kind "reconcile". Payloads carry public and provider refs only.
 *
 * @param {{
 *   absences: { withdrawal?: string[], ingestionGap?: string[], unexplained?: string[] },
 *   ref: string,
 *   slug: string,
 *   tour: string,
 *   providerTournamentId: string|number,
 *   fixturesLoaded: boolean,
 *   entriesLoaded: boolean,
 * }} input
 */
export function absenceObservability(input) {
  const absences = input?.absences || {};
  const payloadBase = {
    ref: String(input?.ref || ""),
    slug: String(input?.slug || ""),
    tour: String(input?.tour || ""),
    provider_tournament_id: String(input?.providerTournamentId || ""),
    fixtures_loaded: Boolean(input?.fixturesLoaded),
    entries_loaded: Boolean(input?.entriesLoaded),
  };
  /** @type {Array<{ kind: "error"|"reconcile", name: string, payload: Record<string, unknown> }>} */
  const rows = [];
  const withdrawal = Array.isArray(absences.withdrawal) ? absences.withdrawal : [];
  const ingestionGap = Array.isArray(absences.ingestionGap) ? absences.ingestionGap : [];
  const unexplained = Array.isArray(absences.unexplained) ? absences.unexplained : [];
  if (withdrawal.length) {
    rows.push({
      kind: "reconcile",
      name: "withdrawal",
      payload: {
        ...payloadBase,
        provider_player_ids: withdrawal.slice(0, 40),
      },
    });
  }
  if (ingestionGap.length) {
    rows.push({
      kind: "error",
      name: "ingestion_gap",
      payload: {
        ...payloadBase,
        severity: "error",
        provider_player_ids: ingestionGap.slice(0, 40),
      },
    });
  }
  if (unexplained.length) {
    rows.push({
      kind: "error",
      name: "unexplained_absence",
      payload: {
        ...payloadBase,
        severity: "error",
        provider_player_ids: unexplained.slice(0, 40),
      },
    });
  }
  return rows;
}

/** @param {{ kind: string, name: string, payload: Record<string, unknown> }} row */
export function absenceSignalLog(row) {
  const payload = row?.payload || {};
  const players = Array.isArray(payload.provider_player_ids)
    ? payload.provider_player_ids.join(",")
    : "";
  const severity = row?.kind === "error" ? "error" : "info";
  return [
    `severity=${severity}`,
    `name=${row?.name || ""}`,
    `ref=${payload.ref || ""}`,
    `slug=${payload.slug || ""}`,
    `tour=${payload.tour || ""}`,
    `provider_tournament_id=${payload.provider_tournament_id || ""}`,
    `fixtures_loaded=${payload.fixtures_loaded}`,
    `entries_loaded=${payload.entries_loaded}`,
    `provider_player_ids=${players}`,
  ].join(" ");
}

/**
 * @param {unknown} value
 * @returns {"day"|"night"|null}
 */
function storedSession(value) {
  return value === "day" || value === "night" ? value : null;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function storedCourt(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

/**
 * @param {Record<string, unknown>} row
 */
function fixtureFactRank(row) {
  const session = parseMatchSession(row) || "";
  const court = parseMatchCourt(row) || "";
  return `${session ? 1 : 0}${court ? 1 : 0}|${session}|${court}`;
}

/**
 * Plan session and court fills from fixture rows.
 * A clock, a session word other than day or night, and an event surface
 * are not writes. Match order is not a court. Existing labels are kept.
 *
 * @param {{
 *   matches: Array<{
 *     id: string,
 *     round?: number,
 *     index_in_round?: number,
 *     provider_match_id?: string|null,
 *     session?: string|null,
 *     court?: string|null,
 *   }>,
 *   fixtures?: Array<Record<string, unknown>>,
 * }} input
 */
export function planSessionCourtBackfill(input) {
  const matches = [...(Array.isArray(input?.matches) ? input.matches : [])].sort(
    (a, b) =>
      Number(a.round) - Number(b.round) ||
      Number(a.index_in_round) - Number(b.index_in_round) ||
      String(a.id).localeCompare(String(b.id))
  );
  const fixtures = [...(Array.isArray(input?.fixtures) ? input.fixtures : [])]
    .filter((row) => row && typeof row === "object")
    .sort((a, b) => {
      const id = String(a.id ?? "").localeCompare(String(b.id ?? ""), "en", {
        numeric: true,
      });
      if (id !== 0) return id;
      return fixtureFactRank(b).localeCompare(fixtureFactRank(a));
    });
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map();
  for (const row of fixtures) {
    const id = String(row.id ?? "").trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, row);
  }

  /** @type {Array<{ match_id: string, provider_match_id: string, session?: "day"|"night", court?: string }>} */
  const writes = [];
  /** @type {Array<{ match_id: string, field: "session"|"court", existing: string, incoming: string }>} */
  const conflicts = [];
  let changed = 0;
  let unchanged = 0;
  let unknownSession = 0;
  let unknownCourt = 0;
  let missingProviderMapping = 0;

  for (const match of matches) {
    const providerId = String(match.provider_match_id ?? "").trim();
    const row = providerId ? byId.get(providerId) : undefined;
    if (!row) missingProviderMapping += 1;
    const incomingSession = row ? parseMatchSession(row) : null;
    const incomingCourt = row ? parseMatchCourt(row) : null;
    const haveSession = storedSession(match.session);
    const haveCourt = storedCourt(match.court);
    /** @type {{ match_id: string, provider_match_id: string, session?: "day"|"night", court?: string }} */
    const write = { match_id: String(match.id), provider_match_id: providerId };

    if (incomingSession && !haveSession) write.session = incomingSession;
    else if (incomingSession && haveSession && incomingSession !== haveSession) {
      conflicts.push({
        match_id: String(match.id),
        field: "session",
        existing: haveSession,
        incoming: incomingSession,
      });
    }
    if (incomingCourt && !haveCourt) write.court = incomingCourt;
    else if (incomingCourt && haveCourt && incomingCourt !== haveCourt) {
      conflicts.push({
        match_id: String(match.id),
        field: "court",
        existing: haveCourt,
        incoming: incomingCourt,
      });
    }

    const nextSession = haveSession || write.session || null;
    const nextCourt = haveCourt || write.court || null;
    if (!nextSession) unknownSession += 1;
    if (!nextCourt) unknownCourt += 1;
    if (write.session || write.court) {
      changed += 1;
      writes.push(write);
    } else {
      unchanged += 1;
    }
  }

  writes.sort((a, b) => a.match_id.localeCompare(b.match_id));
  conflicts.sort(
    (a, b) => a.match_id.localeCompare(b.match_id) || a.field.localeCompare(b.field)
  );
  return {
    changed,
    unchanged,
    unknownSession,
    unknownCourt,
    missingProviderMapping,
    writes,
    conflicts,
  };
}
