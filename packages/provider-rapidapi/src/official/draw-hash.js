/**
 * Canonical JSON + SHA-256 for draw revision hashing.
 */

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
}

/** Seat snapshot used for hashing (structure only). */
export function seatsCanonicalPayload(seats) {
  const rows = (Array.isArray(seats) ? seats : []).map((s) => ({
    position: Number(s.position),
    kind: s.seat_kind || s.kind || (s.is_bye ? "bye" : "player"),
    provider_player_id: s.provider_player_id
      ? String(s.provider_player_id)
      : null,
    last_name: s.last_name ?? null,
    seed: s.seed == null ? null : Number(s.seed),
    entry: s.entry_status ?? s.entry ?? null,
    tbd_label: s.tbd_label ?? null,
  }));
  rows.sort((a, b) => a.position - b.position);
  return { seats: rows, drawSize: rows.length };
}

export function canonicalJson(payload) {
  return stableStringify(payload);
}

function bytesToHex(buf) {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return bytesToHex(buf);
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

export async function hashDrawSeats(seats) {
  return sha256Hex(canonicalJson(seatsCanonicalPayload(seats)));
}

/**
 * Validate official seat sheet before persist.
 * @returns {{ ok: true, drawSize: number } | { ok: false, reason: string }}
 */
export function validateOfficialSeats(seats) {
  const rows = Array.isArray(seats) ? seats : [];
  const n = rows.length;
  if (n < 8 || (n & (n - 1)) !== 0 || n > 128) {
    return { ok: false, reason: `draw size ${n} is not a valid power of 2` };
  }
  const positions = new Set();
  const playerIds = new Set();
  for (const s of rows) {
    const pos = Number(s.position);
    if (!Number.isInteger(pos) || pos < 0 || pos >= n) {
      return { ok: false, reason: `invalid seat position ${s.position}` };
    }
    if (positions.has(pos)) {
      return { ok: false, reason: `duplicate seat position ${pos}` };
    }
    positions.add(pos);
    const kind = s.seat_kind || s.kind || (s.is_bye ? "bye" : "player");
    const pid = s.provider_player_id ? String(s.provider_player_id) : null;
    if (kind === "player" && pid) {
      if (playerIds.has(pid)) {
        return {
          ok: false,
          reason: `player ${pid} appears in two seats`,
        };
      }
      playerIds.add(pid);
    }
  }
  if (positions.size !== n) {
    return { ok: false, reason: "seat positions are not contiguous 0..N-1" };
  }
  for (let i = 0; i < n; i++) {
    if (!positions.has(i)) {
      return { ok: false, reason: `gap at seat position ${i}` };
    }
  }
  return { ok: true, drawSize: n };
}
