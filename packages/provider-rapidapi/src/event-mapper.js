/**
 * EventMapper — core fixture / player pair → Socket.IO event id.
 * Never treat fixture id as socket event id.
 */

import { parseMatchId } from "./live.js";

export function normalizePairKey(playerA, playerB) {
  const a = String(playerA);
  const b = String(playerB);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Resolve a live socket event id from Extend live list / event/get candidates.
 *
 * @param {{
 *   player1Id: string,
 *   player2Id: string,
 *   providerTournamentId?: string,
 *   scheduledDate?: string|null,
 * }} fixture
 * @param {unknown[]} liveEvents
 * @param {{ eventGet?: (q: object) => Promise<unknown> }} [apis]
 */
export async function resolveLiveEvent(fixture, liveEvents = [], apis = {}) {
  const pair = normalizePairKey(fixture.player1Id, fixture.player2Id);
  const candidates = [];

  for (const row of Array.isArray(liveEvents) ? liveEvents : []) {
    const parsed = parseMatchId(row?.matchId ?? row?.match_id);
    if (!parsed) continue;
    if (
      fixture.providerTournamentId &&
      parsed.tournamentId !== String(fixture.providerTournamentId)
    ) {
      continue;
    }
    if (normalizePairKey(parsed.player1Id, parsed.player2Id) !== pair) continue;
    const eventId = row.id != null ? String(row.id) : null;
    if (eventId) {
      candidates.push({
        socket_event_id: eventId,
        method: "live_events_pair",
        confidence: "high",
      });
    }
  }

  if (candidates.length === 0 && typeof apis.eventGet === "function") {
    try {
      const body = await apis.eventGet({
        player1: fixture.player1Id,
        player2: fixture.player2Id,
        date: fixture.scheduledDate || undefined,
      });
      const list = Array.isArray(body)
        ? body
        : Array.isArray(body?.events)
          ? body.events
          : Array.isArray(body?.data)
            ? body.data
            : body?.id
              ? [body]
              : [];
      for (const row of list) {
        const eventId = row?.id != null ? String(row.id) : null;
        if (!eventId) continue;
        candidates.push({
          socket_event_id: eventId,
          method: "event_get",
          confidence: list.length === 1 ? "medium" : "low",
        });
      }
    } catch {
      // treat as miss
    }
  }

  if (candidates.length === 0) {
    return {
      pair_key: pair,
      socket_event_id: null,
      status: "not_found",
      confidence: "low",
      method: null,
      expires_at: new Date(Date.now() + 90_000).toISOString(),
    };
  }

  if (candidates.length > 1) {
    const unique = [...new Set(candidates.map((c) => c.socket_event_id))];
    if (unique.length > 1) {
      return {
        pair_key: pair,
        socket_event_id: null,
        status: "ambiguous",
        confidence: "low",
        method: "multi_candidate",
        expires_at: new Date(Date.now() + 90_000).toISOString(),
      };
    }
  }

  const best = candidates[0];
  return {
    pair_key: pair,
    socket_event_id: best.socket_event_id,
    status: "mapped",
    confidence: best.confidence,
    method: best.method,
    expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
  };
}

/**
 * Lookup Extend event/get when available on this RapidAPI host.
 */
export async function getExtendEvent(client, query) {
  const qs = new URLSearchParams();
  if (query.player1) qs.set("player1", String(query.player1));
  if (query.player2) qs.set("player2", String(query.player2));
  if (query.date) qs.set("date", String(query.date).slice(0, 10));
  const path = `/tennis/v2/extend/api/event/get?${qs.toString()}`;
  return client.get(path);
}
