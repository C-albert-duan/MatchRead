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
 * Tournament results (Game archive). player1 is typically winner; prefer match_winner.
 * @param {{ get: (path: string) => Promise<any> }} client
 * @param {'atp'|'wta'} tour
 * @param {string|number} providerTournamentId
 */
export async function getTournamentResults(client, tour, providerTournamentId) {
  const t = tour === "wta" ? "wta" : "atp";
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
