/**
 * Attach Tennis API player ids onto an official draw without changing slot order.
 * Official seats (bye / TBD / named) stay; names are never invented.
 * Later-round match_keys are mapped from the official tree + published pairs.
 */

function fold(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

function lastToken(value) {
  const parts = String(value || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  return fold(parts[parts.length - 1] || "");
}

function givenToken(value) {
  const parts = String(value || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  return fold(parts[0] || "");
}

function playerFromUnknown(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? raw.playerId ?? "").trim();
  const name = String(raw.name ?? raw.fullName ?? "").trim();
  if (!id || !name) return null;
  const country = String(raw.countryAcr ?? raw.country ?? "XXX")
    .slice(0, 3)
    .toUpperCase();
  return {
    id,
    name,
    last: lastToken(name),
    given: givenToken(name),
    country_code: /^[A-Z]{3}$/.test(country) ? country : "XXX",
  };
}

function collectFixturePlayers(rows) {
  /** @type {Array<NonNullable<ReturnType<typeof playerFromUnknown>>>} */
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    for (const person of [row.player1, row.player2]) {
      const p = playerFromUnknown(person);
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

function matchOfficialToProvider(seat, catalog, opts = {}) {
  if (seat.seat_kind !== "player") return null;
  const last = lastToken(seat.last_name);
  if (!last) return null;
  const hits = catalog.filter((p) => p.last === last || fold(p.name).endsWith(last));
  if (hits.length === 0) return null;
  const given = givenToken(seat.given_name || "");
  const ambiguousLast = Boolean(opts.ambiguousLast);
  if (hits.length === 1 && !ambiguousLast) return hits[0];
  if (given) {
    const named = hits.filter((p) => p.given === given || fold(p.name).includes(given));
    if (named.length === 1) return named[0];
  }
  return null;
}

function parseInstant(row) {
  if (!row || typeof row !== "object") return null;
  const rawDate = String(row.date ?? row.start ?? row.startDate ?? row.datetime ?? "").trim();
  if (!rawDate) return null;
  if (/T\d{2}:\d{2}/.test(rawDate)) {
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return null;
    return {
      scheduled_at: d.toISOString(),
      has_time: !/T00:00(?::00)?/.test(rawDate),
    };
  }
  return null;
}

function rowPlayerIds(row) {
  if (!row || typeof row !== "object") return null;
  const id1 = String(row.player1Id ?? row.player1?.id ?? "").trim();
  const id2 = String(row.player2Id ?? row.player2?.id ?? "").trim();
  if (!id1 || !id2 || id1 === id2) return null;
  return [id1, id2];
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function indexRowsByPair(rows) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const ids = rowPlayerIds(row);
    if (!ids) continue;
    const key = pairKey(ids[0], ids[1]);
    const prev = map.get(key);
    if (!prev || winnerIdFromRow(row) || row.result) map.set(key, row);
  }
  return map;
}

function winnerIdFromRow(row) {
  if (!row || typeof row !== "object") return null;
  if (row.match_winner != null && row.match_winner !== "") {
    return String(row.match_winner);
  }
  const winner =
    row.winnerId ?? row.winner_id ?? row.winner?.id ?? row.playerWinnerId;
  if (winner != null && winner !== "") return String(winner);
  return null;
}

function voidedRow(row) {
  const t = String(row?.result_type || "").toLowerCase();
  return t === "walkover" || t === "default" || t === "cancelled" || t === "canceled";
}

function fillTbdSeats(seats, rows, catalog, prefix = "atp") {
  const byId = new Map(
    seats.filter((s) => s.provider_player_id).map((s) => [String(s.provider_player_id), s])
  );
  const catalogById = new Map(catalog.map((p) => [p.id, p]));
  const refPrefix = String(prefix || "atp").replace(/[^a-z0-9-]/gi, "") || "atp";

  for (let i = 0; i < seats.length; i += 2) {
    const a = seats[i];
    const b = seats[i + 1];
    if (!a || !b) continue;
    /** @type {Array<[typeof a, typeof b]>} */
    const pairs = [];
    if (a.seat_kind === "player" && a.provider_player_id && b.seat_kind === "tbd") {
      pairs.push([a, b]);
    }
    if (b.seat_kind === "player" && b.provider_player_id && a.seat_kind === "tbd") {
      pairs.push([b, a]);
    }
    for (const [named, tbd] of pairs) {
      const opponents = new Set();
      for (const row of Array.isArray(rows) ? rows : []) {
        const ids = rowPlayerIds(row);
        if (!ids) continue;
        if (ids[0] === named.provider_player_id) opponents.add(ids[1]);
        if (ids[1] === named.provider_player_id) opponents.add(ids[0]);
      }
      const fresh = [...opponents].filter((id) => !byId.has(id));
      if (fresh.length !== 1) continue;
      const id = fresh[0];
      const person = catalogById.get(id);
      if (!person || !person.last) continue;
      tbd.seat_kind = "player";
      tbd.is_bye = false;
      tbd.last_name = person.last[0].toUpperCase() + person.last.slice(1);
      if (person.name) {
        const parts = person.name.trim().split(/\s+/);
        tbd.last_name = parts[parts.length - 1];
      }
      tbd.country_code =
        person.country_code && person.country_code !== "XXX"
          ? person.country_code
          : tbd.country_code;
      tbd.provider_player_id = id;
      // Real named seat — never keep a tbd-* / Qualifier identity.
      tbd.player_ref = `${refPrefix}-${id}`;
      byId.set(id, tbd);
    }
  }
  return seats;
}

function mapOfficialTree(seats, rows) {
  const drawSize = seats.length;
  const byPair = indexRowsByPair(rows);
  /** @type {Record<string, string>} */
  const matches = {};
  /** @type {Array<{match_key:string,scheduled_at:string,has_time:boolean}>} */
  const schedule = [];
  /** @type {Array<{match_key:string,winner_ref:string|null,voided:boolean}>} */
  const results = [];

  /** @type {Array<{ref:string,providerId:string|null,kind:string}|null>} */
  let occupants = seats.map((s) => ({
    ref: s.player_ref,
    providerId: s.provider_player_id ? String(s.provider_player_id) : null,
    kind: s.seat_kind,
  }));

  let remaining = drawSize;
  let round = 0;
  while (remaining >= 2) {
    const count = remaining / 2;
    const advanced = [];
    for (let m = 0; m < count; m++) {
      const key = `r${round}-m${m}`;
      const a = occupants[m * 2];
      const b = occupants[m * 2 + 1];
      if (a?.kind === "bye" && b?.kind === "player") {
        advanced.push(b);
        continue;
      }
      if (b?.kind === "bye" && a?.kind === "player") {
        advanced.push(a);
        continue;
      }
      if (a?.providerId && b?.providerId) {
        const row = byPair.get(pairKey(a.providerId, b.providerId));
        if (row) {
          const fxId = String(row.id ?? "").trim();
          if (fxId) matches[fxId] = key;
          const instant = parseInstant(row);
          if (instant) schedule.push({ match_key: key, ...instant });
          if (voidedRow(row) && !winnerIdFromRow(row)) {
            results.push({ match_key: key, winner_ref: null, voided: true });
            advanced.push(null);
            continue;
          }
          const winnerId = winnerIdFromRow(row);
          if (winnerId === a.providerId) {
            results.push({ match_key: key, winner_ref: a.ref, voided: false });
            advanced.push(a);
            continue;
          }
          if (winnerId === b.providerId) {
            results.push({ match_key: key, winner_ref: b.ref, voided: false });
            advanced.push(b);
            continue;
          }
        }
      }
      advanced.push(null);
    }
    occupants = advanced;
    remaining = count;
    round += 1;
  }

  return { matches, schedule, results };
}

/**
 * @param {Array<Record<string, unknown>>} officialSeats
 * @param {unknown[]} fixtures
 * @param {{ prefix?: string, results?: unknown[] }} opts
 */
export function overlayOfficialDraw(officialSeats, fixtures, opts = {}) {
  const seatsIn = Array.isArray(officialSeats) ? officialSeats : [];
  const drawSize = seatsIn.length;
  if (!drawSize || (drawSize & (drawSize - 1)) !== 0) {
    return { ok: false, reason: `official draw size ${drawSize} is not a power of 2` };
  }

  const rows = [...(Array.isArray(fixtures) ? fixtures : []), ...(Array.isArray(opts.results) ? opts.results : [])];
  const catalog = collectFixturePlayers(rows);
  const lastCounts = new Map();
  for (const raw of seatsIn) {
    const kind = raw.seat_kind || (raw.is_bye ? "bye" : "player");
    if (kind !== "player") continue;
    const last = lastToken(raw.last_name);
    if (!last) continue;
    lastCounts.set(last, (lastCounts.get(last) || 0) + 1);
  }
  /** @type {Record<string, string>} */
  const players = {};
  const usedIds = new Set();
  const seats = seatsIn.map((raw) => {
    const kind = raw.seat_kind || (raw.is_bye ? "bye" : "player");
    const last = lastToken(raw.last_name);
    const matched =
      kind === "player"
        ? matchOfficialToProvider(raw, catalog, {
            ambiguousLast: (lastCounts.get(last) || 0) > 1,
          })
        : null;
    let providerId = matched?.id || raw.provider_player_id || null;
    if (providerId && usedIds.has(String(providerId))) providerId = null;
    const ref = String(raw.player_ref);
    if (providerId) {
      usedIds.add(String(providerId));
      players[String(providerId)] = ref;
    }
    return {
      position: Number(raw.position ?? seatsIn.indexOf(raw)),
      player_ref: ref,
      last_name: String(raw.last_name),
      given_name: raw.given_name || null,
      seed: raw.seed == null ? null : Number(raw.seed),
      country_code:
        matched?.country_code && matched.country_code !== "XXX"
          ? matched.country_code
          : String(raw.country_code || "XXX"),
      is_bye: kind === "bye",
      seat_kind: kind,
      entry_status: raw.entry_status || null,
      provider_player_id: providerId,
    };
  });

  const prefix = String(opts.prefix || "atp").replace(/[^a-z0-9-]/gi, "") || "atp";
  fillTbdSeats(seats, rows, catalog, prefix);
  for (const s of seats) {
    if (s.provider_player_id) players[String(s.provider_player_id)] = s.player_ref;
  }

  // Never publish a winner that is still an official TBD label.
  const tree = mapOfficialTree(seats, rows);
  tree.results = tree.results.filter((r) => {
    if (r.voided) return true;
    const ref = String(r.winner_ref || "");
    if (!ref || /^tbd-/i.test(ref)) return false;
    const seat = seats.find((s) => s.player_ref === ref);
    if (!seat) return true;
    if (seat.seat_kind === "tbd") return false;
    if (/^qualifier$/i.test(String(seat.last_name || ""))) return false;
    return Boolean(seat.provider_player_id);
  });

  const named = seats.filter((s) => s.seat_kind === "player").length;
  const byes = seats.filter((s) => s.seat_kind === "bye").length;
  const tbds = seats.filter((s) => s.seat_kind === "tbd").length;
  const withId = seats.filter((s) => s.provider_player_id).length;

  return {
    ok: true,
    drawSize,
    seats,
    players,
    matches: tree.matches,
    schedule: tree.schedule,
    results: tree.results,
    stats: {
      firstRound: drawSize / 2,
      verifiedPlayers: named,
      mappedPlayers: withId,
      byes,
      tbd: tbds,
    },
  };
}
