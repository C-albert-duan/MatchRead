/**
 * Shared published-sheet overlay patches and fake-bye unwind plan.
 * No slug / event / field-size branches.
 */

/**
 * Seat write when an already-published bye must become an official TBD.
 *
 * @param {{ kind?: string, seat_kind?: string }|null|undefined} existing
 * @param {{
 *   kind?: string,
 *   seat_kind?: string,
 *   tbd_label?: string|null,
 *   last_name?: string|null,
 *   entry?: string|null,
 *   seed?: number|null,
 * }|null|undefined} incoming
 * @returns {Record<string, unknown>|null}
 */
export function overlaySeatPatch(existing, incoming) {
  const from = String(existing?.kind || existing?.seat_kind || "").toLowerCase();
  const to = String(incoming?.kind || incoming?.seat_kind || "").toLowerCase();
  if (from !== "bye" || to !== "tbd") return null;
  const label = String(
    incoming?.tbd_label || incoming?.last_name || "Qualifier"
  ).trim();
  return {
    kind: "tbd",
    tbd_label: label || "Qualifier",
    player_id: null,
    entry: incoming?.entry ?? null,
    seed: incoming?.seed ?? null,
  };
}

/**
 * Whether an R0 settle was the invented bye-advance (named player vs empty
 * bye/TBD side, winner = that named player). A real named-vs-named result
 * is not a fake bye.
 *
 * @param {{
 *   childWinnerId?: string|null,
 *   remainingPlayerId?: string|null,
 *   vacatedPlayerId?: string|null,
 * }} s
 */
export function isFakeByeSettlement(s) {
  const winner = s?.childWinnerId ? String(s.childWinnerId) : "";
  const remaining = s?.remainingPlayerId ? String(s.remainingPlayerId) : "";
  const vacated = s?.vacatedPlayerId ? String(s.vacatedPlayerId) : "";
  if (!winner || !remaining) return false;
  if (winner !== remaining) return false;
  if (vacated) return false;
  return true;
}

/**
 * Plan unwind after bye → tbd. Parent side is cleared only when it still
 * holds the invented advance and the parent is not a played/settled match.
 *
 * @param {{
 *   childWinnerId?: string|null,
 *   remainingPlayerId?: string|null,
 *   vacatedPlayerId?: string|null,
 *   parentWinnerId?: string|null,
 *   parentSettledAt?: string|null,
 *   parentOccupantId?: string|null,
 * }} s
 * @returns {{ clearChildSettlement: boolean, clearParentSide: boolean }}
 */
export function planFakeByeUnwind(s) {
  if (!isFakeByeSettlement(s)) {
    return { clearChildSettlement: false, clearParentSide: false };
  }
  const parentPlayed = Boolean(s.parentWinnerId || s.parentSettledAt);
  const occupant = s.parentOccupantId ? String(s.parentOccupantId) : "";
  const remaining = s.remainingPlayerId ? String(s.remainingPlayerId) : "";
  return {
    clearChildSettlement: true,
    clearParentSide: !parentPlayed && Boolean(occupant) && occupant === remaining,
  };
}

/** R0 index and parent side for a first-round seat position. */
export function r0IndexFromSeatPosition(position) {
  const pos = Number(position);
  return {
    indexInRound: Math.floor(pos / 2),
    childSide: pos % 2 === 0 ? "a" : "b",
  };
}
