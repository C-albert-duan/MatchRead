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
    const parsed = parseMatchId(row?.matchId ?? row?.match_id);
    return parsed?.tournamentId === tid;
  });
}

export async function getLiveEvents(client) {
  const body = await client.get("/tennis/v2/extend/api/events/live");
  return { events: liveEventList(body), raw: body };
}

export async function getWsToken(client) {
  const body = await client.get("/tennis/v2/extend/api/ws-token");
  const token =
    body?.token ??
    body?.data?.token ??
    body?.result?.token ??
    body?.accessToken ??
    null;
  return { token: token ? String(token) : null, raw: body };
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
    const parsed = parseMatchId(row.matchId ?? row.match_id);
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
