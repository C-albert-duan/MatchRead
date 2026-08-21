/**
 * Diff two official seat sheets by stable position.
 */

function kindOf(s) {
  return s?.seat_kind || s?.kind || (s?.is_bye ? "bye" : "player");
}

function providerId(s) {
  const id = s?.provider_player_id;
  return id != null && String(id).trim() ? String(id).trim() : null;
}

/**
 * @param {Array} prevSeats
 * @param {Array} nextSeats
 * @returns {Array<{
 *   position: number,
 *   change_kind: string,
 *   old_provider_player_id: string|null,
 *   new_provider_player_id: string|null,
 *   old_kind: string,
 *   new_kind: string
 * }>}
 */
export function diffDrawSeats(prevSeats, nextSeats) {
  const prev = new Map(
    (Array.isArray(prevSeats) ? prevSeats : []).map((s) => [
      Number(s.position),
      s,
    ])
  );
  const next = new Map(
    (Array.isArray(nextSeats) ? nextSeats : []).map((s) => [
      Number(s.position),
      s,
    ])
  );
  const positions = new Set([...prev.keys(), ...next.keys()]);
  /** @type {ReturnType<typeof diffDrawSeats>} */
  const changes = [];

  for (const position of [...positions].sort((a, b) => a - b)) {
    const a = prev.get(position);
    const b = next.get(position);
    if (!b) continue;
    if (!a) {
      changes.push({
        position,
        change_kind: "other",
        old_provider_player_id: null,
        new_provider_player_id: providerId(b),
        old_kind: "missing",
        new_kind: kindOf(b),
      });
      continue;
    }
    const ak = kindOf(a);
    const bk = kindOf(b);
    const ap = providerId(a);
    const bp = providerId(b);

    if (ak === bk && ap === bp) continue;

    let change_kind = "other";
    if (ak === "tbd" && bk === "player" && bp) change_kind = "tbd_filled";
    else if (ak === "bye" && bk === "player") change_kind = "bye_to_player";
    else if (ak === "player" && bk === "bye") change_kind = "player_to_bye";
    else if (ak === "player" && bk === "player" && ap && bp && ap !== bp) {
      change_kind = "replacement";
    }

    changes.push({
      position,
      change_kind,
      old_provider_player_id: ap,
      new_provider_player_id: bp,
      old_kind: ak,
      new_kind: bk,
    });
  }
  return changes;
}

export function pairKey(a, b) {
  const x = String(a);
  const y = String(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}
