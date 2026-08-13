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
