/**
 * Mega live facts only — scores and finished status.
 * Odds / predictions are ignored.
 */

export function parseMatchId(matchId) {
  const parts = String(matchId || "").split("-");
  if (parts.length < 4) return null;
  const [player1Id, player2Id, tournamentId, roundId] = parts;
  if (!player1Id || !player2Id || !tournamentId) return null;
  return { player1Id, player2Id, tournamentId, roundId };
}

/**
 * Tournament id from `seasonId` when that value is an id, otherwise the
 * third `matchId` segment. A season id and a match-id segment that disagree
 * are not an identity. Player names are not read.
 * @param {unknown} frame
 * @returns {string | null}
 */
export function capturedTournamentId(frame) {
  if (!frame || typeof frame !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (frame);
  const season = idToken(record.seasonId);
  const fromMatch = parseMatchId(record.matchId)?.tournamentId ?? null;
  if (season && fromMatch && season !== fromMatch) return null;
  return season || fromMatch;
}

function idToken(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || /\s/.test(text)) return null;
  return text;
}

export function liveEventList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.results)) return raw.results;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.events)) return raw.events;
  return [];
}

export function isFinishedLiveStatus(status) {
  return /^(finished|ended|complete|completed)$/i.test(String(status || "").trim());
}

/**
 * Live winner is only trusted when the payload names a winner id.
 * Score strings are not parsed into a winner.
 */
export function liveWinnerId(event) {
  if (!event || typeof event !== "object") return null;
  const id = event.winnerId ?? event.winner_id ?? event.match_winner ?? event.winner;
  if (id == null || id === "") return null;
  return String(id);
}

export function liveEventsForTournament(events, providerTournamentId) {
  const tid = String(providerTournamentId);
  return liveEventList(events).filter((row) => {
    const parsed = parseMatchId(row?.matchId);
    return parsed?.tournamentId === tid;
  });
}

export async function getLiveEvents(client) {
  const body = await client.get("/tennis/v2/extend/api/events/live");
  return { events: liveEventList(body), raw: body };
}

/** Captured `GET` path. Body keys on that response are `success` and `token`. */
export const WS_TOKEN_PATH = "/tennis/v2/extend/api/ws-token";

/**
 * Observed token body only: `success: true` and a string `token`.
 * Nested or renamed token fields were not in the captured responses.
 * @param {{ get: (path: string) => Promise<any> }} client
 */
export async function getWsToken(client) {
  const body = await client.get(WS_TOKEN_PATH);
  const token =
    body?.success === true && typeof body.token === "string" && body.token.trim()
      ? body.token.trim()
      : null;
  return { token, raw: body };
}

/**
 * Captured tokens carry `exp` and `iat` as unix seconds.
 * `exp` is the expiry. A token with no `exp` has no observed expiry signal.
 * @param {unknown} token
 * @returns {{ exp: number, iat: number | null } | null}
 */
export function tokenExpiry(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
    const iat = typeof payload.iat === "number" && Number.isFinite(payload.iat) ? payload.iat : null;
    return { exp: payload.exp, iat };
  } catch {
    return null;
  }
}

/**
 * True when the captured `exp` claim is now.
 * This is the expiry signal. The captures contain no TOKEN_EXPIRED error.
 * @param {unknown} token
 * @param {number} [nowMs]
 */
export function isTokenExpired(token, nowMs = Date.now()) {
  const expiry = tokenExpiry(token);
  if (!expiry || !Number.isFinite(nowMs)) return false;
  return Math.floor(nowMs / 1000) >= expiry.exp;
}

/**
 * Proactive refresh stays off.
 * The captured tokens claim `exp - iat` of 86400 seconds. That interval was not
 * waited out, and no early-refresh lead was measured. A timer would invent one.
 * Configuration cannot turn the timer on. Recovery stays the reactive `exp` check.
 * @param {NodeJS.ProcessEnv} [_env]
 */
export function proactiveRefreshEnabled(_env) {
  return false;
}

/**
 * Map finished live rows onto MatchRead results using player-id maps.
 * Unmapped or winner-less finished rows are skipped (fail closed).
 */
export function mapLiveFinishedToIngest(events, mapping) {
  const players = mapping.players || {};
  const matches = mapping.matches || {};
  const results = [];
  const skipped = [];

  for (const row of liveEventList(events)) {
    if (!isFinishedLiveStatus(row?.status)) continue;
    const parsed = parseMatchId(row.matchId);
    if (!parsed) {
      skipped.push({ id: String(row.id ?? "?"), reason: "no matchId" });
      continue;
    }
    const pairPipe =
      parsed.player1Id < parsed.player2Id
        ? `${parsed.player1Id}|${parsed.player2Id}`
        : `${parsed.player2Id}|${parsed.player1Id}`;
    const matchKey =
      matches[String(row.id ?? "")] ||
      matches[String(row.matchId ?? "")] ||
      matches[pairPipe] ||
      matches[`${parsed.player1Id}-${parsed.player2Id}`] ||
      matches[`${parsed.player2Id}-${parsed.player1Id}`];
    if (!matchKey) {
      skipped.push({ id: String(row.id ?? pairPipe), reason: "no match_key mapping" });
      continue;
    }
    const winnerId = liveWinnerId(row);
    if (!winnerId) {
      skipped.push({
        id: String(row.id ?? pairPipe),
        reason: "finished without winner id",
      });
      continue;
    }
    const winnerRef = players[winnerId];
    if (!winnerRef) {
      skipped.push({
        id: String(row.id ?? pairPipe),
        reason: `winner provider id ${winnerId} not in players map`,
      });
      continue;
    }
    results.push({ match_key: matchKey, winner_ref: winnerRef, voided: false });
  }

  return { results, skipped };
}
