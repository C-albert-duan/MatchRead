/**
 * Turn a Tennis API draw payload into official seats.
 * Slot order comes from the draw. Names/byes/TBD are copied, never invented.
 */

function fold(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

function slug(last) {
  return fold(last).replace(/^-|-$/g, "") || "player";
}

function lastToken(value) {
  const parts = String(value || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  return parts[parts.length - 1] || "";
}

function unwrap(raw) {
  if (!raw || typeof raw !== "object") return raw;
  return (
    raw.data ??
    raw.draws ??
    raw.draw ??
    raw.results ??
    raw.result ??
    raw.bracket ??
    raw
  );
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.rounds)) return value.rounds;
  if (Array.isArray(value.matches)) return value.matches;
  if (Array.isArray(value.games)) return value.games;
  if (Array.isArray(value.ties)) return value.ties;
  if (Array.isArray(value.encounters)) return value.encounters;
  if (Array.isArray(value.fixtures)) return value.fixtures;
  if (Array.isArray(value.players)) return value.players;
  if (Array.isArray(value.seats)) return value.seats;
  return [];
}

function isByeName(name) {
  return /^(bye|byes?)$/i.test(String(name || "").trim());
}

function isTbdName(name) {
  return /^(qualifier|qualifiers?|lucky\s*loser|q|ll|tbd|to\s*be\s*determined)$/i.test(
    String(name || "").trim()
  );
}

function parseSeed(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/[^0-9]/g, ""));
  if (Number.isInteger(n) && n > 0 && n < 128) return n;
  return null;
}

function parseEntry(raw, name) {
  const blob = `${raw ?? ""} ${name ?? ""}`.toLowerCase();
  if (/\bwc\b|wild\s*card|wildcard/.test(blob)) return "wc";
  if (/\bpr\b|protected/.test(blob)) return "pr";
  return null;
}

function personFromUnknown(raw, seedHint, entryHint) {
  if (raw === null || raw === undefined) {
    return { kind: "bye" };
  }
  if (typeof raw !== "object") {
    const name = String(raw).trim();
    if (!name || isByeName(name)) return { kind: "bye" };
    if (isTbdName(name)) return { kind: "tbd", last_name: "Qualifier" };
    return {
      kind: "player",
      last_name: lastToken(name),
      given_name: name.split(/\s+/)[0] || null,
      seed: parseSeed(seedHint),
      country_code: "XXX",
      entry_status: parseEntry(entryHint, name),
      provider_player_id: null,
    };
  }
  if (raw.isBye === true || raw.bye === true || raw.is_bye === true) {
    return { kind: "bye" };
  }
  const name = String(
    raw.name ?? raw.fullName ?? raw.lastName ?? raw.playerName ?? ""
  ).trim();
  const last =
    String(raw.lastName ?? raw.last_name ?? "").trim() || lastToken(name);
  const id = String(raw.id ?? raw.playerId ?? raw.player_id ?? "").trim();
  if (isByeName(name) || isByeName(last)) return { kind: "bye" };
  if (!name && !last && !id) return { kind: "tbd", last_name: "Qualifier" };
  if (isTbdName(name) || isTbdName(last) || raw.tbd === true) {
    return { kind: "tbd", last_name: last || "Qualifier" };
  }
  if (!last || /^player\d*$/i.test(last)) return { kind: "tbd", last_name: "Qualifier" };
  const given =
    String(raw.firstName ?? raw.given_name ?? "").trim() ||
    name.split(/\s+/).filter(Boolean)[0] ||
    null;
  const country = String(raw.countryAcr ?? raw.country ?? raw.countryCode ?? "XXX")
    .slice(0, 3)
    .toUpperCase();
  return {
    kind: "player",
    last_name: last,
    given_name: given,
    seed: parseSeed(raw.seed ?? raw.seeding ?? seedHint),
    country_code: /^[A-Z]{3}$/.test(country) ? country : "XXX",
    entry_status: parseEntry(raw.entry ?? raw.entryStatus ?? entryHint, name),
    provider_player_id: id || null,
  };
}

function matchSides(row) {
  if (!row || typeof row !== "object") return null;
  let a =
    row.player1 ??
    row.home ??
    row.participant1 ??
    row.p1 ??
    row.a ??
    row.top ??
    row.team1;
  let b =
    row.player2 ??
    row.away ??
    row.participant2 ??
    row.p2 ??
    row.b ??
    row.bottom ??
    row.team2;
  if (a === undefined && b === undefined) {
    const comps = row.competitors ?? row.players;
    if (Array.isArray(comps) && comps.length === 2) {
      a = comps[0];
      b = comps[1];
    }
  }
  if (a === undefined && b === undefined) return null;
  return [
    personFromUnknown(a, row.seed1 ?? row.player1Seed, row.entry1),
    personFromUnknown(b, row.seed2 ?? row.player2Seed, row.entry2),
  ];
}

function collectMatchArrays(node, out = [], expected = 0) {
  if (!node) return out;
  if (Array.isArray(node)) {
    const sides = node.map(matchSides).filter(Boolean);
    const need = expected ? expected / 2 : 0;
    if (need && sides.length === need) {
      out.push(sides);
    } else if (sides.length >= 8 && (sides.length & (sides.length - 1)) === 0) {
      out.push(sides);
    } else {
      for (const item of node) collectMatchArrays(item, out, expected);
    }
    return out;
  }
  if (typeof node !== "object") return out;
  for (const key of ["matches", "games", "ties", "encounters", "fixtures"]) {
    if (Array.isArray(node[key])) collectMatchArrays(node[key], out, expected);
  }
  if (Array.isArray(node.rounds)) {
    for (const round of node.rounds) collectMatchArrays(round, out, expected);
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectMatchArrays(value, out, expected);
  }
  return out;
}

function collectSeatArrays(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    const people = node.map((row) => personFromUnknown(row));
    if (people.length >= 16 && (people.length & (people.length - 1)) === 0) {
      out.push(people);
    } else {
      for (const item of node) collectSeatArrays(item, out);
    }
    return out;
  }
  if (typeof node !== "object") return out;
  if (Array.isArray(node.players)) collectSeatArrays(node.players, out);
  if (Array.isArray(node.seats)) collectSeatArrays(node.seats, out);
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectSeatArrays(value, out);
  }
  return out;
}

function toSeat(person, position, prefix) {
  if (person.kind === "bye") {
    return {
      position,
      player_ref: `bye-${position}`,
      last_name: "Bye",
      given_name: null,
      seed: null,
      country_code: "XXX",
      is_bye: true,
      seat_kind: "bye",
      entry_status: null,
      provider_player_id: null,
    };
  }
  if (person.kind === "tbd") {
    return {
      position,
      player_ref: `tbd-${position}`,
      last_name: person.last_name || "Qualifier",
      given_name: null,
      seed: null,
      country_code: "XXX",
      is_bye: false,
      seat_kind: "tbd",
      entry_status: null,
      provider_player_id: null,
    };
  }
  return {
    position,
    player_ref: `${prefix}-${position}-${slug(person.last_name)}`,
    last_name: person.last_name,
    given_name: person.given_name,
    seed: person.seed,
    country_code: person.country_code,
    is_bye: false,
    seat_kind: "player",
    entry_status: person.entry_status,
    provider_player_id: person.provider_player_id,
  };
}

/**
 * @param {unknown} raw
 * @param {{ prefix?: string }} [opts]
 */
export function parseOfficialDraw(raw, opts = {}) {
  const prefix = String(opts.prefix || "p").replace(/[^a-z0-9-]/gi, "") || "p";
  const expected = Number(opts.expectedDrawSize) || 0;
  const body = unwrap(raw);
  const matchSets = collectMatchArrays(body, [], expected);
  const picked = pickSized(
    matchSets.map((sides) => ({ item: sides, drawSize: sides.length * 2 })),
    expected
  );
  if (picked) {
    const seats = [];
    picked.item.forEach((pair, i) => {
      seats.push(toSeat(pair[0], i * 2, prefix));
      seats.push(toSeat(pair[1], i * 2 + 1, prefix));
    });
    return { ok: true, drawSize: picked.drawSize, seats, source: "api-matches" };
  }

  const seatSets = collectSeatArrays(body);
  const pickedSeats = pickSized(
    seatSets.map((people) => ({ item: people, drawSize: people.length })),
    expected
  );
  if (pickedSeats) {
    return {
      ok: true,
      drawSize: pickedSeats.drawSize,
      seats: pickedSeats.item.map((p, i) => toSeat(p, i, prefix)),
      source: "api-seats",
    };
  }

  if (expected) {
    return {
      ok: false,
      reason: `no official Tennis API draw of size ${expected}`,
    };
  }
  return { ok: false, reason: "Tennis API draw has no official slot list" };
}

function pickSized(candidates, expected) {
  const valid = candidates.filter(
    (row) => row.drawSize >= 16 && (row.drawSize & (row.drawSize - 1)) === 0
  );
  if (expected) {
    return valid.find((row) => row.drawSize === expected) || null;
  }
  valid.sort((a, b) => b.drawSize - a.drawSize);
  return valid[0] || null;
}

export function drawNameCandidates(event) {
  const out = [];
  const seen = new Set();
  const push = (value) => {
    const name = String(value || "")
      .replace(/\s+20\d{2}\s*$/, "")
      .trim();
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    out.push(name);
  };
  push(event?.api_name);
  push(event?.name);
  const strippedOpen = String(event?.api_name || event?.name || "").replace(
    /\s+Open\s*$/i,
    ""
  );
  push(strippedOpen);
  const blob = `${event?.api_name || ""} ${event?.name || ""} ${event?.ref || ""}`;
  if (/cincinnati/i.test(blob)) {
    push("Cincinnati Open");
    push("Cincinnati");
    push("Western & Southern Open");
    push("Western and Southern Open");
  }
  return out;
}

export function drawYear(event) {
  const on = String(event?.starts_on || "").slice(0, 4);
  if (/^20\d{2}$/.test(on)) return Number(on);
  return new Date().getUTCFullYear();
}
