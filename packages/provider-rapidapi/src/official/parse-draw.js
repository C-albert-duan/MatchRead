/**
 * Turn a Tennis API draw payload into official seats.
 * Slot order comes from the draw. Names/byes/TBD are copied, never invented.
 * Qualifying / doubles sheets are rejected — size alone never selects the draw.
 */

import { canonicalizeDisplayName, auxiliaryLastName } from "../normalize.js";
import {
  classifyDraw,
  countSeeds,
  nonMainDrawKind,
} from "./classify-draw.js";

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

/**
 * Tennis API uses the same placeholder *object* for an official seed bye and
 * an unnamed Q/LL seat (`id` 3700, name "Unknown Player"). For that object,
 * name/id alone never decide; match-level `result` does (`"bye"` vs `""`).
 *
 * After the bye is consumed the API drops that object: the vacant side is
 * JSON `null` / omitted with empty `result`. That remnant is an official
 * bye, not TBD. TBD stays the 3700 object. Seed, slot, and draw size are
 * not used.
 */
function isUnknownPlaceholder(name) {
  return /^unknown(\s+player)?$/i.test(String(name || "").trim());
}

function isUnknownPlaceholderPerson(raw) {
  if (raw == null || typeof raw !== "object") return false;
  const name = String(
    raw.name ?? raw.fullName ?? raw.lastName ?? raw.playerName ?? ""
  ).trim();
  const last = String(raw.lastName ?? raw.last_name ?? "").trim();
  const id = String(raw.id ?? raw.playerId ?? raw.player_id ?? "").trim();
  return id === "3700" || isUnknownPlaceholder(name) || isUnknownPlaceholder(last);
}

function isNamedPlayerSide(raw) {
  if (raw == null) return false;
  if (typeof raw !== "object") {
    const name = String(raw).trim();
    return (
      Boolean(name) &&
      !isByeName(name) &&
      !isTbdName(name) &&
      !isUnknownPlaceholder(name)
    );
  }
  if (raw.isBye === true || raw.bye === true || raw.is_bye === true) return false;
  if (isUnknownPlaceholderPerson(raw)) return false;
  const name = String(
    raw.name ?? raw.fullName ?? raw.lastName ?? raw.playerName ?? ""
  ).trim();
  const last = String(raw.lastName ?? raw.last_name ?? "").trim();
  if (isByeName(name) || isByeName(last)) return false;
  if (isTbdName(name) || isTbdName(last) || raw.tbd === true) return false;
  return Boolean(name || last);
}

function isOfficialByeResult(result) {
  return String(result ?? "").trim().toLowerCase() === "bye";
}

function placeholderKind(result) {
  return isOfficialByeResult(result)
    ? { kind: "bye" }
    : { kind: "tbd", last_name: "Qualifier" };
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

function personFromUnknown(raw, seedHint, entryHint, matchResult, oppositeNamed) {
  if (raw === null || raw === undefined) {
    // Consumed official bye: vacant JSON side, not the 3700 Q object.
    // Primary live shape: null opposite a named player. Never TBD.
    if (oppositeNamed) return { kind: "bye" };
    return { kind: "bye" };
  }
  if (typeof raw !== "object") {
    const name = String(raw).trim();
    if (isByeName(name)) return { kind: "bye" };
    if (isTbdName(name)) return { kind: "tbd", last_name: "Qualifier" };
    if (!name || isUnknownPlaceholder(name)) return placeholderKind(matchResult);
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
  if (isByeName(name) || isByeName(last)) {
    return { kind: "bye" };
  }
  if (isUnknownPlaceholderPerson(raw) || isUnknownPlaceholder(name) || isUnknownPlaceholder(last)) {
    return placeholderKind(matchResult);
  }
  if (isTbdName(name) || isTbdName(last) || raw.tbd === true) {
    const entry = parseEntry(raw.entry ?? raw.entryStatus ?? entryHint, name);
    return {
      kind: "tbd",
      last_name: last || (entry === "ll" ? "Lucky Loser" : "Qualifier"),
      entry_status: entry,
    };
  }
  if (!name && !last && !id) return placeholderKind(matchResult);
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
    personFromUnknown(
      a,
      row.seed1 ?? row.player1Seed,
      row.entry1,
      row.result,
      isNamedPlayerSide(b)
    ),
    personFromUnknown(
      b,
      row.seed2 ?? row.player2Seed,
      row.entry2,
      row.result,
      isNamedPlayerSide(a)
    ),
  ];
}

/**
 * @param {unknown} node
 * @param {Array<{ sides: any[][], pathHint: string }>} out
 * @param {number} expected
 * @param {string} pathHint
 */
function collectMatchArrays(node, out = [], expected = 0, pathHint = "main") {
  if (!node) return out;
  if (nonMainDrawKind(pathHint)) return out;
  if (Array.isArray(node)) {
    const sides = node.map(matchSides).filter(Boolean);
    const need = expected ? expected / 2 : 0;
    if (need && sides.length === need) {
      out.push({ sides, pathHint });
    } else if (isPowerOfTwo(sides.length)) {
      out.push({ sides, pathHint });
    } else {
      const grouped = matchSetsFromRoundGroups(node);
      if (grouped.length > 0) {
        for (const g of grouped) out.push({ sides: g, pathHint });
      } else {
        for (const item of node) {
          collectMatchArrays(item, out, expected, pathHint);
        }
      }
    }
    return out;
  }
  if (typeof node !== "object") return out;
  for (const key of ["matches", "games", "ties", "encounters", "fixtures"]) {
    if (Array.isArray(node[key])) {
      collectMatchArrays(node[key], out, expected, pathHint);
    }
  }
  if (Array.isArray(node.rounds)) {
    for (const round of node.rounds) {
      collectMatchArrays(round, out, expected, pathHint);
    }
  }
  // Prefer known main-singles keys; never walk qualifying/doubles branches.
  for (const key of ["singles", "singlesDraw", "mainDraw", "md"]) {
    if (node[key] && typeof node[key] === "object") {
      collectMatchArrays(node[key], out, expected, key);
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== "object") continue;
    if (
      [
        "matches",
        "games",
        "ties",
        "encounters",
        "fixtures",
        "rounds",
        "singles",
        "singlesDraw",
        "mainDraw",
        "md",
      ].includes(key)
    ) {
      continue;
    }
    if (nonMainDrawKind(key)) continue;
    collectMatchArrays(value, out, expected, key);
  }
  return out;
}

/**
 * @param {unknown} node
 * @param {Array<{ people: any[], pathHint: string }>} out
 * @param {string} pathHint
 */
function collectSeatArrays(node, out = [], pathHint = "main") {
  if (!node) return out;
  if (nonMainDrawKind(pathHint)) return out;
  if (Array.isArray(node)) {
    const people = node.map((row) => personFromUnknown(row));
    if (people.length >= 16 && (people.length & (people.length - 1)) === 0) {
      out.push({ people, pathHint });
    } else {
      for (const item of node) collectSeatArrays(item, out, pathHint);
    }
    return out;
  }
  if (typeof node !== "object") return out;
  if (Array.isArray(node.players)) {
    collectSeatArrays(node.players, out, pathHint);
  }
  if (Array.isArray(node.seats)) {
    collectSeatArrays(node.seats, out, pathHint);
  }
  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== "object") continue;
    if (key === "players" || key === "seats") continue;
    if (nonMainDrawKind(key)) continue;
    collectSeatArrays(value, out, key);
  }
  return out;
}

/** Infer terminal-round match count from a flat multi-round singles list. */
function terminalRoundMatchCount(raw) {
  const body = unwrap(raw);
  if (!body || typeof body !== "object") return null;
  const singles =
    body.singles ?? body.singlesDraw ?? body.mainDraw ?? body.md ?? null;
  const rows = Array.isArray(singles)
    ? singles
    : Array.isArray(body)
      ? body
      : [];
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const groups = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (!matchSides(row)) continue;
    const key = roundKey(row);
    if (!key) continue;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  if (groups.size < 2) return null;
  let min = Infinity;
  for (const n of groups.values()) {
    if (n < min) min = n;
  }
  return Number.isFinite(min) ? min : null;
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
 * @param {{ prefix?: string, expectedDrawSize?: number, acceptedDrawSizes?: number[] }} [opts]
 *   `acceptedDrawSizes`: sheet sizes to accept, in preference order. Defaults
 *   to `[expectedDrawSize]`. The picked sheet is classified at its own size.
 */
export function parseOfficialDraw(raw, opts = {}) {
  const prefix = String(opts.prefix || "p").replace(/[^a-z0-9-]/gi, "") || "p";
  const expected = Number(opts.expectedDrawSize) || 0;
  const accepted = (
    Array.isArray(opts.acceptedDrawSizes) && opts.acceptedDrawSizes.length
      ? opts.acceptedDrawSizes
      : [expected]
  )
    .map(Number)
    .filter((size) => size > 0);
  const body = unwrap(raw);
  const terminalRoundMatches = terminalRoundMatchCount(raw);
  const matchSets = collectMatchArrays(body, [], expected);
  const picked = pickSized(
    matchSets.map((row) => ({
      item: row.sides,
      drawSize: row.sides.length * 2,
      pathHint: row.pathHint,
    })),
    accepted
  );
  if (picked) {
    const seats = [];
    picked.item.forEach((pair, i) => {
      seats.push(toSeat(pair[0], i * 2, prefix));
      seats.push(toSeat(pair[1], i * 2 + 1, prefix));
    });
    const classified = classifyDraw(
      {
        pathHint: picked.pathHint,
        size: picked.drawSize,
        expectedSize: accepted.length ? picked.drawSize : 0,
        seedCount: countSeeds(seats),
        terminalRoundMatches,
      },
      { draw_size: accepted.length ? picked.drawSize : null }
    );
    if (classified.kind === "rejected") {
      return {
        ok: false,
        reason: `rejected ${classified.reason} draw (size ${picked.drawSize})`,
        drawClass: classified,
        draw_types_seen: [classified.reason],
      };
    }
    return {
      ok: true,
      drawSize: picked.drawSize,
      seats,
      source: "api-matches",
      drawClass: classified,
    };
  }

  const seatSets = collectSeatArrays(body);
  const pickedSeats = pickSized(
    seatSets.map((row) => ({
      item: row.people,
      drawSize: row.people.length,
      pathHint: row.pathHint,
    })),
    accepted
  );
  if (pickedSeats) {
    const seats = pickedSeats.item.map((p, i) => toSeat(p, i, prefix));
    const classified = classifyDraw(
      {
        pathHint: pickedSeats.pathHint,
        size: pickedSeats.drawSize,
        expectedSize: accepted.length ? pickedSeats.drawSize : 0,
        seedCount: countSeeds(seats),
        terminalRoundMatches,
      },
      { draw_size: accepted.length ? pickedSeats.drawSize : null }
    );
    if (classified.kind === "rejected") {
      return {
        ok: false,
        reason: `rejected ${classified.reason} draw (size ${pickedSeats.drawSize})`,
        drawClass: classified,
        draw_types_seen: [classified.reason],
      };
    }
    return {
      ok: true,
      drawSize: pickedSeats.drawSize,
      seats,
      source: "api-seats",
      drawClass: classified,
    };
  }

  // Explicit non-main keys in the payload — useful for ops logs.
  const seen = [];
  if (body && typeof body === "object" && !Array.isArray(body)) {
    for (const key of Object.keys(body)) {
      const kind = nonMainDrawKind(key);
      if (kind) seen.push(kind);
    }
  }
  if (accepted.length) {
    return {
      ok: false,
      reason: `no official Tennis API main-singles draw of size ${accepted.join(" or ")}`,
      draw_types_seen: seen,
    };
  }
  return {
    ok: false,
    reason: "Tennis API draw has no official main-singles slot list",
    draw_types_seen: seen,
  };
}

/** First valid candidate of the first accepted size; the largest when none are given. */
function pickSized(candidates, accepted) {
  const valid = candidates.filter(
    (row) => row.drawSize >= 16 && (row.drawSize & (row.drawSize - 1)) === 0
  );
  if (accepted.length) {
    for (const size of accepted) {
      const hit = valid.find((row) => row.drawSize === size);
      if (hit) return hit;
    }
    return null;
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
  const base = String(event?.api_name || event?.name || "");
  push(base.replace(/\s+Open\s*$/i, ""));
  // "Title Open - City" → left of dash
  const dashCity = base.split(/\s+-\s+/)[0];
  push(dashCity);
  push(String(dashCity || "").replace(/\s+Open\s*$/i, ""));
  // Generic US / U.S. spelling variants from whatever the provider sent
  for (const existing of [...out]) {
    if (/u\.s\./i.test(existing)) {
      push(existing.replace(/u\.s\./gi, "US"));
    }
    if (/\bus\b/i.test(existing)) {
      push(existing.replace(/\bUS\b/g, "U.S."));
    }
  }
  const slug = String(event?.slug || event?.ref || "");
  const slugWords = slug
    .replace(/^t-(atp|wta)-/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b20\d{2}\b/g, "")
    .trim();
  if (slugWords && !/^\d+$/.test(slugWords)) {
    push(slugWords);
  }
  return out;
}

export function drawYear(event) {
  const on = String(
    event?.main_draw_starts_on || event?.starts_on || ""
  ).slice(0, 4);
  if (/^20\d{2}$/.test(on)) return Number(on);
  return new Date().getUTCFullYear();
}
