/**
 * Draw-type classifier. Size is a safeguard only — never the decision.
 * Ordered: provider/path type → terminal round → seeds → size.
 */

const ALLOWED_SIZES = new Set([8, 16, 32, 48, 56, 64, 96, 128]);

function fold(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * True when a payload key / type string names a non-main-singles sheet.
 * @param {unknown} raw
 * @returns {'qualifying' | 'doubles' | 'mixed' | null}
 */
export function nonMainDrawKind(raw) {
  const key = fold(raw);
  if (!key) return null;
  if (/qualif|lucky.?loser.?draw|qd\b/.test(key)) return "qualifying";
  if (/mixed/.test(key)) return "mixed";
  if (/doubles|dbls|xd\b/.test(key)) return "doubles";
  return null;
}

/**
 * @typedef {{
 *   providerType?: string|null,
 *   pathHint?: string|null,
 *   size?: number|null,
 *   expectedSize?: number|null,
 *   seedCount?: number|null,
 *   terminalRoundMatches?: number|null,
 * }} DrawTypeEvidence
 *
 * @typedef {{ draw_size?: number|null, tier?: string|null }} TournamentRow
 *
 * @typedef {
 *   | { kind: 'main_singles', size: number }
 *   | { kind: 'rejected', reason:
 *       | 'qualifying' | 'doubles' | 'mixed' | 'unknown_type'
 *       | 'no_seeds' | 'size_mismatch' | 'terminal_round_not_final' }
 * } DrawClass
 */

/**
 * Classify a candidate sheet as main singles or rejected.
 * Never infers main-singles from "the array has players in it."
 * @param {DrawTypeEvidence} evidence
 * @param {TournamentRow} [tournament]
 * @returns {DrawClass}
 */
export function classifyDraw(evidence = {}, tournament = {}) {
  const typeBlob = `${evidence.providerType ?? ""} ${evidence.pathHint ?? ""}`;
  const nonMain = nonMainDrawKind(typeBlob);
  if (nonMain === "qualifying") {
    return { kind: "rejected", reason: "qualifying" };
  }
  if (nonMain === "doubles") {
    return { kind: "rejected", reason: "doubles" };
  }
  if (nonMain === "mixed") {
    return { kind: "rejected", reason: "mixed" };
  }

  const size = Number(evidence.size) || 0;
  const expected =
    Number(evidence.expectedSize) || Number(tournament.draw_size) || 0;
  const seeds = Number(evidence.seedCount) || 0;

  // Slam qualifying terminates in 16 matches (16 qualifiers). A main draw
  // terminates in a final. Incomplete later-round dumps (R64/R32 only) must
  // not fail this check.
  if (
    evidence.terminalRoundMatches != null &&
    Number(evidence.terminalRoundMatches) === 16 &&
    (size === 128 || expected === 128)
  ) {
    return { kind: "rejected", reason: "qualifying" };
  }

  // Zero seeds in a large field is the concrete US Open qualifying signature.
  // A published main draw of 64+ always carries seeds.
  if (size >= 64 && seeds === 0) {
    return { kind: "rejected", reason: "no_seeds" };
  }
  // Slam main carries 32 seeds; soft floor rejects sparse / mis-keyed sheets.
  if ((size === 128 || expected === 128) && seeds > 0 && seeds < 16) {
    return { kind: "rejected", reason: "no_seeds" };
  }

  // Size last — safeguard only.
  if (!size || !ALLOWED_SIZES.has(size)) {
    return { kind: "rejected", reason: "size_mismatch" };
  }
  if (expected && size !== expected) {
    // 96-player Masters are stored as 128 seats + byes.
    if (!(expected === 96 && size === 128)) {
      return { kind: "rejected", reason: "size_mismatch" };
    }
  }

  return { kind: "main_singles", size };
}

/**
 * Seed count from parsed seats (named seats with a positive seed).
 * @param {Array<{ seed?: number|null, seat_kind?: string, kind?: string, is_bye?: boolean }>} seats
 */
export function countSeeds(seats) {
  if (!Array.isArray(seats)) return 0;
  let n = 0;
  for (const s of seats) {
    const kind = s.seat_kind || s.kind || (s.is_bye ? "bye" : "player");
    if (kind !== "player" && kind !== undefined) continue;
    const seed = Number(s.seed);
    if (Number.isInteger(seed) && seed > 0) n += 1;
  }
  return n;
}
