/**
 * @typedef {object} RapidApiClientOptions
 * @property {string} key
 * @property {string} [host]
 */

/**
 * @typedef {object} ProviderMatchResult
 * @property {string|number} id
 * @property {number|null|undefined} [match_winner]
 * @property {number|null|undefined} [player1Id]
 * @property {number|null|undefined} [player2Id]
 * @property {string|null|undefined} [result]
 * @property {string|null|undefined} [result_type]
 * @property {number|null|undefined} [roundId]
 * @property {number|null|undefined} [tournamentId]
 */

/**
 * @typedef {object} ReconcileMapping
 * @property {string} tournament_id MatchRead tournaments.id (uuid)
 * @property {string} provider_tournament_id RapidAPI tournament/season id
 * @property {'atp'|'wta'} [tour]
 * @property {Record<string, string>} players provider_player_id → player_ref
 * @property {Record<string, string>} matches provider_match_id → match_key
 */

/**
 * @typedef {object} IngestResultRow
 * @property {string} match_key
 * @property {string|null} winner_ref
 * @property {boolean} voided
 */

/**
 * @param {RapidApiClientOptions} opts
 */
export function createClient(opts) {
  const key = opts.key?.trim();
  const host = (opts.host || "tennis-api-atp-wta-itf.p.rapidapi.com").trim();
  if (!key) throw new Error("RAPIDAPI_KEY required");

  /**
   * @param {string} path path beginning with /
   * @param {number} [attempt]
   */
  async function get(path, attempt = 0) {
    const url = `https://${host}${path}`;
    const res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": host,
        Accept: "application/json",
      },
    });

    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const ms = backoffMs(attempt);
      await sleep(ms);
      return get(path, attempt + 1);
    }

    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      const err = new Error(
        `RapidAPI ${res.status} ${path}: ${typeof body === "object" && body?.message ? body.message : text.slice(0, 200)}`
      );
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  return { host, get };
}

/**
 * @param {'atp'|'wta'|string|null|undefined} tour
 * @returns {'atp'|'wta'}
 */
export function normalizeTour(tour) {
  return tour === "wta" ? "wta" : "atp";
}

/**
 * Tournament calendar for one tour/year (discovery).
 * @param {{ get: (path: string) => Promise<any> }} client
 * @param {'atp'|'wta'} tour
 * @param {number|string} year
 * @param {{ since?: string, pageSize?: number, pageNo?: number, filter?: string }} [opts]
 */
export async function getTournamentCalendar(client, tour, year, opts = {}) {
  const t = normalizeTour(tour);
  const y = String(year).trim();
  const qs = new URLSearchParams();
  if (opts.since) qs.set("since", opts.since);
  if (opts.pageSize != null) qs.set("pageSize", String(opts.pageSize));
  if (opts.pageNo != null) qs.set("pageNo", String(opts.pageNo));
  if (opts.filter) qs.set("filter", opts.filter);
  const q = qs.toString();
  const path = `/tennis/v2/${t}/tournament/calendar/${y}${q ? `?${q}` : ""}`;
  const body = await client.get(path);
  const data = body?.data ?? body;
  /** @type {any[]} */
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.tournaments)
      ? data.tournaments
      : Array.isArray(data?.rows)
        ? data.rows
        : [];
  return { tour: t, year: Number(y), tournaments: rows, raw: body };
}

/**
 * Pull ATP + WTA calendars for the same year (dual-tour discovery).
 * @param {{ get: (path: string) => Promise<any> }} client
 * @param {number|string} year
 * @param {{ since?: string, pageSize?: number, pageNo?: number, filter?: string }} [opts]
 */
export async function getDualTourCalendar(client, year, opts = {}) {
  const [atp, wta] = await Promise.all([
    getTournamentCalendar(client, "atp", year, opts),
    getTournamentCalendar(client, "wta", year, opts),
  ]);
  return { atp, wta };
}

/**
 * Tournament season info.
 * @param {{ get: (path: string) => Promise<any> }} client
 * @param {'atp'|'wta'} tour
 * @param {string|number} providerTournamentId
 */
export async function getTournamentInfo(client, tour, providerTournamentId) {
  const t = normalizeTour(tour);
  const id = String(providerTournamentId).trim();
  const body = await client.get(`/tennis/v2/${t}/tournament/info/${id}`);
  const data = body?.data ?? body;
  return { tour: t, info: data, raw: body };
}

/**
 * Tournament results (Game archive). player1 is typically winner; prefer match_winner.
 * @param {{ get: (path: string) => Promise<any> }} client
 * @param {'atp'|'wta'} tour
 * @param {string|number} providerTournamentId
 */
export async function getTournamentResults(client, tour, providerTournamentId) {
  const t = normalizeTour(tour);
  const id = String(providerTournamentId).trim();
  const body = await client.get(`/tennis/v2/${t}/tournament/results/${id}`);
  const data = body?.data ?? body;
  /** @type {ProviderMatchResult[]} */
  const singles = Array.isArray(data?.singles) ? data.singles : [];
  /** @type {ProviderMatchResult[]} */
  const doubles = Array.isArray(data?.doubles) ? data.doubles : [];
  return { singles, doubles, raw: body };
}

export function encodeDrawName(name) {
  return encodeURIComponent(String(name || "").trim());
}

/**
 * Official main-draw sheet (Mega). Name path, not season id.
 * @param {{ get: (path: string) => Promise<any> }} client
 * @param {'atp'|'wta'} tour
 * @param {string} tournamentName
 * @param {number|string} year
 */
export async function getTournamentDraw(client, tour, tournamentName, year) {
  const t = normalizeTour(tour);
  const encoded = encodeDrawName(tournamentName);
  const y = String(year).trim();
  const paths = [
    `/tennis/v2/tournament/${t}/${encoded}/${y}/draws?includeAll=true`,
    `/tennis/v2/ms-api/tournament/${t}/${encoded}/${y}/draws`,
  ];
  let lastErr = null;
  for (const path of paths) {
    try {
      const raw = await client.get(path);
      return { tour: t, name: tournamentName, year: Number(y), raw };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("draw endpoint failed");
}

/**
 * Official seeds list (Mega).
 */
export async function getTournamentSeeds(client, tour, tournamentName, year) {
  const t = normalizeTour(tour);
  const encoded = encodeDrawName(tournamentName);
  const y = String(year).trim();
  const raw = await client.get(
    `/tennis/v2/tournament/${t}/${encoded}/${y}/seeds?includeAll=true`
  );
  return { tour: t, name: tournamentName, year: Number(y), raw };
}

/**
 * Upcoming / scheduled fixtures for a tournament season.
 * @param {{ get: (path: string) => Promise<any> }} client
 * @param {'atp'|'wta'} tour
 * @param {string|number} providerTournamentId
 * @param {{ include?: string, filter?: string, pageSize?: number }} [opts]
 */
export async function getTournamentFixtures(
  client,
  tour,
  providerTournamentId,
  opts = {}
) {
  const t = normalizeTour(tour);
  const id = String(providerTournamentId).trim();
  const qs = new URLSearchParams();
  qs.set(
    "include",
    opts.include || "round,tournament,tournament.court,tournament.country"
  );
  qs.set("filter", opts.filter || "PlayerGroup:singles");
  qs.set("pageSize", String(opts.pageSize ?? 500));
  const body = await client.get(
    `/tennis/v2/${t}/fixtures/tournament/${id}?${qs}`
  );
  const data = body?.data ?? body;
  /** @type {any[]} */
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.fixtures)
      ? data.fixtures
      : Array.isArray(data?.rows)
        ? data.rows
        : [];
  return { tour: t, fixtures: rows, raw: body };
}

/**
 * Parse a provider fixture/result into a stored instant.
 * Date-only values do not invent a kickoff clock (`has_time: false`).
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {{ scheduled_at: string, has_time: boolean } | null}
 */
export function parseFixtureInstant(row) {
  if (!row || typeof row !== "object") return null;
  const rawDate = String(
    row.date ?? row.start ?? row.startDate ?? row.datetime ?? ""
  ).trim();
  if (!rawDate) return null;

  if (/T\d{2}:\d{2}/.test(rawDate)) {
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return null;
    const hasTime = !/T00:00(?::00)?/.test(rawDate);
    return { scheduled_at: d.toISOString(), has_time: hasTime };
  }

  const day = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const rawTime = String(row.time ?? row.startTime ?? row.hour ?? "").trim();
  const hm = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (hm) {
    const hh = String(hm[1]).padStart(2, "0");
    const d = new Date(`${day}T${hh}:${hm[2]}:${hm[3] || "00"}Z`);
    if (Number.isNaN(d.getTime())) return null;
    return { scheduled_at: d.toISOString(), has_time: true };
  }

  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return { scheduled_at: d.toISOString(), has_time: false };
}

/** @param {Record<string, unknown>|null|undefined} row */
export function fixtureRoundLabel(row) {
  if (!row || typeof row !== "object") return "";
  const r = row.round;
  if (typeof r === "string") return r;
  if (r && typeof r === "object") {
    return String(
      r.name ?? r.roundName ?? r.title ?? r.shortName ?? ""
    );
  }
  return String(row.roundName ?? row.round_name ?? "");
}

/** Qualifying / pre-qual — never the main-draw first ball. */
export function isQualifyingRound(row) {
  return /qualif|pre[-\s]?qual|^q\s*[1-4]\b|lucky\s*loser/i.test(
    fixtureRoundLabel(row)
  );
}

export function isMainDrawFirstRound(row) {
  if (isQualifyingRound(row)) return false;
  const name = fixtureRoundLabel(row).trim();
  return (
    /^(first|1st|r1|r32|r64|r128)$/i.test(name) ||
    /^round of (32|64|96|128)$/i.test(name) ||
    /^(1st|first) round$/i.test(name) ||
    /^round 1$/i.test(name)
  );
}

/**
 * Earliest timed main-draw first-round start.
 * Date-only fixtures are ignored (no invented kickoff).
 * @param {unknown[]} fixtures
 * @returns {{ scheduled_at: string, has_time: true } | null}
 */
export function firstMainDrawBall(fixtures) {
  const rows = Array.isArray(fixtures) ? fixtures : [];
  /** @type {Array<{ scheduled_at: string, first: boolean }>} */
  const timed = [];
  for (const f of rows) {
    if (!f || typeof f !== "object") continue;
    if (isQualifyingRound(f)) continue;
    const parsed = parseFixtureInstant(f);
    if (!parsed?.has_time) continue;
    timed.push({
      scheduled_at: parsed.scheduled_at,
      first: isMainDrawFirstRound(f),
    });
  }
  const pool = timed.filter((x) => x.first);
  if (pool.length === 0) return null;
  pool.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  return { scheduled_at: pool[0].scheduled_at, has_time: true };
}

/** Last token of a provider display name. Empty if missing. */
export function playerLastName(full) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[parts.length - 1] || "";
}

function parseSeed(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0 && n < 128) return n;
  return null;
}

function playerFromFixture(row, side) {
  const person = side === 1 ? row.player1 : row.player2;
  const id = String(
    (side === 1 ? row.player1Id : row.player2Id) ?? person?.id ?? ""
  ).trim();
  const name = String(person?.name ?? person?.fullName ?? "").trim();
  const last = playerLastName(name);
  const country = String(person?.countryAcr ?? person?.country ?? "XXX")
    .slice(0, 3)
    .toUpperCase();
  const seed = parseSeed(side === 1 ? row.seed1 : row.seed2);
  const invented = !last || /^player\d*$/i.test(last);
  if (!id || invented) return null;
  return {
    id,
    last_name: last,
    country_code: /^[A-Z]{3}$/.test(country) ? country : "XXX",
    seed,
  };
}

/**
 * Named main-draw first-round pairs (both sides have provider id + last name).
 * Sorted by provider match id — RapidAPI does not expose draw slots.
 * @param {unknown[]} fixtures
 */
export function namedFirstRoundPairs(fixtures) {
  const rows = Array.isArray(fixtures) ? fixtures : [];
  /** @type {Array<{ id: number, p1: NonNullable<ReturnType<typeof playerFromFixture>>, p2: NonNullable<ReturnType<typeof playerFromFixture>>, instant: ReturnType<typeof parseFixtureInstant> }>} */
  const out = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    if (!isMainDrawFirstRound(raw)) continue;
    const p1 = playerFromFixture(raw, 1);
    const p2 = playerFromFixture(raw, 2);
    if (!p1 || !p2) continue;
    out.push({
      id: Number(raw.id) || 0,
      p1,
      p2,
      instant: parseFixtureInstant(raw),
    });
  }
  out.sort((a, b) => a.id - b.id || a.p1.id.localeCompare(b.p1.id));
  return out;
}

export function expectedFirstRoundMatches(drawSize) {
  const n = Number(drawSize);
  if (n === 128) return 64;
  if (n === 96) return 32;
  if (n === 64) return 32;
  if (n === 32) return 16;
  if (n > 2 && n % 2 === 0) return n / 2;
  return null;
}

export function inferDrawSizeFromFirstRound(pairCount) {
  if (pairCount === 64) return 128;
  // 32 named pairs is ambiguous (true 64-draw vs 96-player / 128-slot Masters).
  // Only an explicit drawSize of 64 may publish a 64. Never infer it.
  if (pairCount === 16) return 32;
  return null;
}

/**
 * Build a verified draw from a complete first-round field.
 * Incomplete fields return `{ ok: false }` — never pad with fiction.
 * 96-player / 128-slot draws need official slots (overlayOfficialDraw).
 * @param {unknown[]} fixtures
 * @param {{ prefix: string, drawSize?: number }} opts
 */
export function buildDrawFromFirstRound(fixtures, opts) {
  const prefix = String(opts?.prefix || "p").replace(/[^a-z0-9-]/gi, "") || "p";
  const pairs = namedFirstRoundPairs(fixtures);
  const requested = Number(opts?.drawSize) || 0;
  const drawSize =
    requested && expectedFirstRoundMatches(requested) === pairs.length
      ? requested
      : inferDrawSizeFromFirstRound(pairs.length);

  if (requested === 128 && pairs.length !== 64) {
    return {
      ok: false,
      reason: `128-draw needs official slots or 64 named slam pairs (got ${pairs.length})`,
      pairs: pairs.length,
    };
  }

  if (requested === 96) {
    return {
      ok: false,
      reason: "96-draw needs official 128-slot sheet with seed byes",
      pairs: pairs.length,
    };
  }

  if (!drawSize) {
    return {
      ok: false,
      reason: `incomplete first round (${pairs.length} named pairs)`,
      pairs: pairs.length,
    };
  }

  const need = expectedFirstRoundMatches(drawSize);
  if (need == null || pairs.length !== need) {
    return {
      ok: false,
      reason: `incomplete first round (${pairs.length}/${need ?? "?"})`,
      pairs: pairs.length,
    };
  }

  const ids = new Set();
  for (const pair of pairs) {
    if (ids.has(pair.p1.id) || ids.has(pair.p2.id) || pair.p1.id === pair.p2.id) {
      return { ok: false, reason: "duplicate player ids in first round", pairs: pairs.length };
    }
    ids.add(pair.p1.id);
    ids.add(pair.p2.id);
  }

  /** @type {Array<{position:number,player_ref:string,last_name:string,seed:number|null,country_code:string,is_bye:boolean,provider_player_id:string}>} */
  const seats = [];
  /** @type {Record<string,string>} */
  const players = {};
  /** @type {Record<string,string>} */
  const matches = {};
  /** @type {Array<{match_key:string,scheduled_at:string,has_time:boolean}>} */
  const schedule = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const key = `r0-m${i}`;
    const place = (pos, p) => {
      const ref = `${prefix}-${p.id}`;
      seats.push({
        position: pos,
        player_ref: ref,
        last_name: p.last_name,
        seed: p.seed,
        country_code: p.country_code,
        is_bye: false,
        seat_kind: "player",
        entry_status: null,
        provider_player_id: p.id,
      });
      players[p.id] = ref;
    };
    place(i * 2, pair.p1);
    place(i * 2 + 1, pair.p2);
    if (pair.id) matches[String(pair.id)] = key;
    if (pair.instant) {
      schedule.push({ match_key: key, ...pair.instant });
    }
  }

  if (seats.length !== drawSize) {
    return { ok: false, reason: `seat count ${seats.length} != ${drawSize}`, pairs: pairs.length };
  }

  return {
    ok: true,
    drawSize,
    seats,
    players,
    matches,
    schedule,
    results: [],
    stats: {
      firstRound: pairs.length,
      verifiedPlayers: seats.length,
      byes: 0,
    },
  };
}

/**
 * Find National Bank Open week events: Montreal (ATP) + Toronto (WTA).
 * @param {{ atp: { tournaments: any[] }, wta: { tournaments: any[] } }} dual
 */
export function resolveNationalBankOpenWeek(dual) {
  const montreal = (dual.atp?.tournaments ?? []).find((row) => {
    const name = String(row?.name ?? "").toLowerCase();
    return name.includes("national bank") && name.includes("montreal");
  });
  const toronto = (dual.wta?.tournaments ?? []).find((row) => {
    const name = String(row?.name ?? "").toLowerCase();
    return name.includes("national bank") && name.includes("toronto");
  });
  return {
    montreal: montreal
      ? {
          tour: "atp",
          provider_tournament_id: String(montreal.id),
          name: montreal.name,
          starts_on: (montreal.date || montreal.start || "").slice?.(0, 10) || null,
        }
      : null,
    toronto: toronto
      ? {
          tour: "wta",
          provider_tournament_id: String(toronto.id),
          name: toronto.name,
          starts_on: (toronto.date || toronto.start || "").slice?.(0, 10) || null,
        }
      : null,
  };
}

/**
 * Map finished singles results → ingest-events rows. Unmapped matches are skipped.
 * @param {ProviderMatchResult[]} matches
 * @param {ReconcileMapping} mapping
 * @returns {{ results: IngestResultRow[], skipped: { id: string, reason: string }[] }}
 */
export function mapResultsToIngest(matches, mapping) {
  /** @type {IngestResultRow[]} */
  const results = [];
  /** @type {{ id: string, reason: string }[]} */
  const skipped = [];

  const players = mapping.players || {};
  const matchMap = mapping.matches || {};

  for (const m of matches) {
    const id = String(m.id ?? "").trim();
    if (!id) {
      skipped.push({ id: "?", reason: "missing provider match id" });
      continue;
    }

    const matchKey = matchMap[id];
    if (!matchKey) {
      skipped.push({ id, reason: "no match_key mapping" });
      continue;
    }

    const winnerId =
      m.match_winner != null && m.match_winner !== ""
        ? String(m.match_winner)
        : null;

    const resultType = (m.result_type || "").toLowerCase();
    const voidLike =
      resultType === "walkover" ||
      resultType === "default" ||
      resultType === "cancelled" ||
      resultType === "canceled";

    // Retirement still has a winner in this API — ingest the winner, do not void.
    if (!winnerId) {
      if (voidLike || !m.result) {
        results.push({ match_key: matchKey, winner_ref: null, voided: true });
      } else {
        skipped.push({ id, reason: "finished but no match_winner" });
      }
      continue;
    }

    const winnerRef = players[winnerId];
    if (!winnerRef) {
      skipped.push({
        id,
        reason: `winner provider id ${winnerId} not in players map`,
      });
      continue;
    }

    results.push({
      match_key: matchKey,
      winner_ref: winnerRef,
      voided: false,
    });
  }

  return { results, skipped };
}

/** @param {number} attempt */
export function backoffMs(attempt) {
  const base = Math.min(8000, 400 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 200);
  return base + jitter;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export { CIN_2026_OFFICIAL } from "./official/cin-2026.js";
export { overlayOfficialDraw } from "./official/overlay.js";
export {
  drawNameCandidates,
  drawYear,
  parseOfficialDraw,
} from "./official/parse-draw.js";
export {
  getLiveEvents,
  getWsToken,
  isFinishedLiveStatus,
  liveEventList,
  liveEventsForTournament,
  liveWinnerId,
  mapLiveFinishedToIngest,
  parseMatchId,
} from "./live.js";

/**
 * Official seats from Tennis API draws. Cincinnati MDS is fallback only
 * when the API sheet is missing. Never invent slot order from match ids.
 * @param {{ get: (path: string) => Promise<any> }} client
 * @param {{ ref?: string, tour?: string, name?: string, api_name?: string, starts_on?: string|null, draw_size?: number }} event
 */
export async function fetchOfficialSeats(client, event) {
  const { drawNameCandidates, drawYear, parseOfficialDraw } = await import(
    "./official/parse-draw.js"
  );
  const { CIN_2026_OFFICIAL } = await import("./official/cin-2026.js");
  // Cincinnati topology is the published MDS sheet. Do not replace slot
  // order with a Tennis API parse of a different shape.
  if (event?.ref === "cin-2026") {
    return {
      ok: true,
      drawSize: CIN_2026_OFFICIAL.seats.length,
      seats: CIN_2026_OFFICIAL.seats,
      source: "mds",
    };
  }
  const prefix = normalizeTour(event?.tour);
  const year = drawYear(event);
  const names = drawNameCandidates(event);
  for (const name of names) {
    try {
      const { raw } = await getTournamentDraw(client, prefix, name, year);
      const parsed = parseOfficialDraw(raw, {
        prefix,
        expectedDrawSize: Number(event?.draw_size) || 0,
      });
      if (parsed.ok) return parsed;
    } catch {
      // try the next published name
    }
  }
  return {
    ok: false,
    reason: "no official Tennis API draw",
  };
}
