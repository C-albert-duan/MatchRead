/**
 * Turn a Tennis API draw payload into official seats.
 * Slot order comes from the draw. Names/byes/TBD are copied, never invented.
 */

import { canonicalizeDisplayName, auxiliaryLastName } from "../normalize.js";

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

/** Tennis API placeholder opposite a seed bye (often id 3700). */
function isUnknownPlaceholder(name) {
  return /^unknown(\s+player)?$/i.test(String(name || "").trim());
}

function isTbdName(name) {
  return /^(qualifier|qualifiers?|lucky\s*loser|q|ll|tbd|to\s*be\s*determined)$/i.test(
    String(name || "").trim()
  );
}

function isPowerOfTwo(n) {
  return Number.isInteger(n) && n >= 8 && (n & (n - 1)) === 0;
}

function roundKey(row) {
  if (!row || typeof row !== "object") return null;
  if (row.roundId != null && row.roundId !== "") return `id:${row.roundId}`;
  const name =
    row.round?.name ??
    row.round?.shortName ??
    row.roundName ??
    (typeof row.round === "string" || typeof row.round === "number"
      ? row.round
      : null);
  if (name != null && String(name).trim()) return `name:${String(name).trim()}`;
  return null;
}

/** Official first-round order when the API tags matches with `draw` / order. */
function sortMatchRows(rows) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const da = Number(
        a.row.draw ?? a.row.drawNumber ?? a.row.order ?? a.row.position ?? NaN
      );
      const db = Number(
        b.row.draw ?? b.row.drawNumber ?? b.row.order ?? b.row.position ?? NaN
      );
      if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
      return a.index - b.index;
    })
    .map((x) => x.row);
}

/**
 * Flat Tennis API draws mix all rounds in one `singles` array.
 * Group by roundId / round name and keep power-of-two first-round sheets.
 */
function matchSetsFromRoundGroups(rows) {
  if (!Array.isArray(rows) || rows.length < 8) return [];
  const groups = new Map();
  let keyed = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (!matchSides(row)) continue;
    const key = roundKey(row);
    if (!key) continue;
    keyed += 1;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  if (keyed < 8) return [];
  const out = [];
  for (const group of groups.values()) {
    const sides = sortMatchRows(group)
      .map(matchSides)
      .filter(Boolean);
    if (isPowerOfTwo(sides.length)) out.push(sides);
  }
  return out;
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
  if (/\bll\b|lucky\s*loser/.test(blob)) return "ll";
  if (/\bq\b|qualif/.test(blob) && !/quarter/.test(blob)) return "q";
  // seed1/seed2 sometimes is the tag string itself
  const tag = String(raw ?? "").trim().toUpperCase();
  if (tag === "WC") return "wc";
  if (tag === "PR") return "pr";
  if (tag === "LL") return "ll";
  if (tag === "Q") return "q";
  return null;
}

/** seed1/seed2 is a union: numeric seed OR entry tag. */
export function parseSeedOrEntry(raw) {
  if (raw == null || raw === "") {
    return { seed: null, entry: null };
  }
  const asStr = String(raw).trim();
  const entry = parseEntry(asStr, "");
  if (entry) return { seed: null, entry };
  const seed = parseSeed(asStr);
  return { seed, entry: null };
}

function personFromUnknown(raw, seedHint, entryHint) {
  if (raw === null || raw === undefined) {
    return { kind: "bye" };
  }
  if (typeof raw !== "object") {
    const name = String(raw).trim();
    if (!name || isByeName(name) || isUnknownPlaceholder(name)) {
      return { kind: "bye" };
    }
    if (isTbdName(name)) return { kind: "tbd", last_name: "Qualifier" };
    const seedEntry = parseSeedOrEntry(seedHint);
    const entryFromHint = parseEntry(entryHint, name);
    const canon = canonicalizeDisplayName(name);
    return {
      kind: "player",
      last_name: canon.lastName,
      display_name: canon.displayName,
      given_name: name.split(/\s+/)[0] || null,
      seed: seedEntry.seed,
      country_code: "XXX",
      entry_status: entryFromHint || seedEntry.entry,
      provider_player_id: null,
      fallback_formatted: canon.fallback,
    };
  }
  if (raw.isBye === true || raw.bye === true || raw.is_bye === true) {
    return { kind: "bye" };
  }
  const name = String(
    raw.name ?? raw.fullName ?? raw.lastName ?? raw.playerName ?? ""
  ).trim();
  const providedLast = String(raw.lastName ?? raw.last_name ?? "").trim();
  const canon = canonicalizeDisplayName(name || providedLast);
  const last = providedLast
    ? auxiliaryLastName(providedLast) || providedLast
    : canon.lastName;
  const displayName = name ? canon.displayName : providedLast || canon.displayName;
  const id = String(raw.id ?? raw.playerId ?? raw.player_id ?? "").trim();
  if (
    isByeName(name) ||
    isByeName(last) ||
    isUnknownPlaceholder(name) ||
    isUnknownPlaceholder(last)
  ) {
    return { kind: "bye" };
  }
  if (!name && !last && !id) return { kind: "tbd", last_name: "Qualifier" };
  if (isTbdName(name) || isTbdName(last) || raw.tbd === true) {
    const entry = parseEntry(raw.entry ?? raw.entryStatus ?? entryHint, name);
    return {
      kind: "tbd",
      last_name: last || (entry === "ll" ? "Lucky Loser" : "Qualifier"),
      entry_status: entry,
    };
  }
  if (!last || /^player\d*$/i.test(last)) {
    return { kind: "tbd", last_name: "Qualifier" };
  }
  const given =
    String(raw.firstName ?? raw.given_name ?? "").trim() ||
    name.split(/\s+/).filter(Boolean)[0] ||
    null;
  const country = String(raw.countryAcr ?? raw.country ?? raw.countryCode ?? "XXX")
    .slice(0, 3)
    .toUpperCase();
  const fromSeedField = parseSeedOrEntry(raw.seed ?? raw.seeding ?? seedHint);
  const fromEntryField = parseEntry(
    raw.entry ?? raw.entryStatus ?? entryHint,
    name
  );
  return {
    kind: "player",
    last_name: last,
    display_name: displayName,
    given_name: given,
    seed: fromSeedField.seed ?? parseSeed(raw.seed ?? raw.seeding ?? seedHint),
    country_code: /^[A-Z]{3}$/.test(country) ? country : "XXX",
    entry_status: fromEntryField || fromSeedField.entry,
    provider_player_id: id || null,
    fallback_formatted: !name && Boolean(providedLast),
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
    } else if (isPowerOfTwo(sides.length)) {
      out.push(sides);
    } else {
      const grouped = matchSetsFromRoundGroups(node);
      if (grouped.length > 0) {
        out.push(...grouped);
      } else {
        for (const item of node) collectMatchArrays(item, out, expected);
      }
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
  // Prefer known draw keys so singles is considered before doubles noise.
  for (const key of ["singles", "singlesDraw", "mainDraw", "md"]) {
    if (node[key] && typeof node[key] === "object") {
      collectMatchArrays(node[key], out, expected);
    }
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
    display_name: person.display_name || person.last_name,
    given_name: person.given_name,
    seed: person.seed,
    country_code: person.country_code,
    is_bye: false,
    seat_kind: "player",
    entry_status: person.entry_status,
    provider_player_id: person.provider_player_id,
    fallback_formatted: Boolean(person.fallback_formatted),
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
  return out;
}

export function drawYear(event) {
  const on = String(event?.starts_on || "").slice(0, 4);
  if (/^20\d{2}$/.test(on)) return Number(on);
  return new Date().getUTCFullYear();
}
