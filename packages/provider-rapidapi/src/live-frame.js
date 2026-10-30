/**
 * Canonical live frames and the projection that stores them.
 * A frame may be stale. It never writes an official result or advances a seat.
 *
 * Provider fields read here are the live-list keys in
 * docs/provider-capture-findings.md: id, matchId, status (InPlay), score,
 * points, indicator, updatedAt. A numeric updatedAt is epoch milliseconds.
 * See docs/live-normalizer-fields.md.
 * seq, replayPhase, and replayWinnerId are replay-harness fields.
 */

import {
  canonicalGame as coreCanonicalGame,
  canonicalSets as coreCanonicalSets,
  liveFlag as coreLiveFlag,
  normalizeLiveMatchState,
} from "../../core/src/live/normalize.ts";
import { liveEventList, parseMatchId } from "./live.js";
import { normalizePairKey } from "./event-mapper.js";

const SEQUENCE_RANK = { seq: 3, updatedAt: 2, receivedAt: 1 };

/**
 * Captured live rows use `InPlay` only. Other status words were not in those bytes.
 * @param {string} status
 * @returns {"in_play" | "unknown"}
 */
export function livePhase(status) {
  const text = String(status || "").trim();
  if (/^inplay$/i.test(text)) return "in_play";
  return "unknown";
}

/**
 * No captured live row has a server id. `indicator` is stored and is not one.
 * @param {Record<string, unknown>} [_row]
 */
export function explicitServingId(_row) {
  return null;
}

/**
 * Provider `updatedAt` as epoch milliseconds or an ISO instant.
 * A bare number is milliseconds. `startTimestamp` is not this clock.
 * @param {unknown} value
 * @returns {number | null}
 */
function clockMs(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = textOrNull(value);
  if (!text) return null;
  if (/^\d{12,16}$/.test(text)) {
    const ms = Number(text);
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Set text is `N-N` parts. Anything else is not stored.
 * @param {unknown} score
 */
export function canonicalSets(score) {
  if (score == null || score === "") return null;
  const text = typeof score === "string" ? score : String(score);
  return coreCanonicalSets(text);
}

/**
 * Game points stay the strings 0, 15, 30, 40, and AD. `A` is AD.
 * AD is not an integer. A pair that is not those points, including a
 * duplicated set such as `5-2`, is not a game and not a tie-break.
 * @param {unknown} points
 */
export function canonicalGame(points) {
  if (points == null || points === "") return null;
  const text = typeof points === "string" ? points : String(points);
  return coreCanonicalGame(text.trim());
}

/**
 * Live or provisional, from the live status. Eligibility is not derived.
 * @param {string} phase
 */
export function liveFlag(phase) {
  if (phase === "terminal") return coreLiveFlag("provisional_final");
  if (phase !== "in_play" && phase !== "suspended" && phase !== "provisional_final") return null;
  return coreLiveFlag(phase);
}

function occurredAtOf(row) {
  const ms = clockMs(row.updatedAt);
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

/**
 * Provider order is `updatedAt` when the capture has it.
 * `seq` is a replay-harness cursor, read only when `source` is `replay`.
 * @param {Record<string, unknown>} row
 * @param {string} receivedAt
 * @param {string} source
 */
function sequenceOf(row, receivedAt, source) {
  if (source === "replay") {
    const seq = row.seq;
    if (typeof seq === "number" && Number.isFinite(seq)) {
      return { sequence: seq, sequence_source: "seq" };
    }
    if (typeof seq === "string" && seq.trim() && Number.isFinite(Number(seq))) {
      return { sequence: Number(seq), sequence_source: "seq" };
    }
  }
  const updated = clockMs(row.updatedAt);
  if (updated != null) return { sequence: updated, sequence_source: "updatedAt" };
  const ms = Date.parse(receivedAt || "");
  return {
    sequence: Number.isFinite(ms) ? ms : 0,
    sequence_source: "receivedAt",
  };
}

/**
 * Captured live rows put the current game on `points`.
 * Prototype names such as `currentGameScore` are not that field.
 * @param {Record<string, unknown>} row
 */
function capturedGameText(row) {
  return textOrNull(row.points);
}

function textOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * @param {unknown} input
 * @returns {Record<string, unknown> | null}
 */
function unwrapLiveRow(input) {
  if (!input || typeof input !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (input);
  if (record.matchId != null || record.id != null) return record;
  return null;
}

/**
 * One provider row, REST or socket, as the live shape MatchRead stores.
 * @param {unknown} input
 */
export function canonicalLiveFrame(input) {
  const row = unwrapLiveRow(input);
  if (!row) return { ok: false, reason: "unrecognized frame" };
  const receivedAt = textOrNull(row.receivedAt);
  const matchId = textOrNull(row.matchId);
  const parsed = parseMatchId(matchId);
  const eventId = textOrNull(row.id);
  const source =
    row.source === "socket" || row.source === "replay" || row.source === "rest"
      ? row.source
      : "rest";
  const phase =
    source === "replay" &&
    (row.replayPhase === "terminal" ||
      row.replayPhase === "in_play" ||
      row.replayPhase === "suspended")
      ? row.replayPhase
      : livePhase(row.status);
  const cursor = sequenceOf(row, receivedAt, source);
  const servingProviderId = explicitServingId(row);
  const provisionalWinnerProviderId =
    source === "replay" && phase === "terminal"
      ? textOrNull(row.replayWinnerId)
      : null;
  const frame = {
    source,
    eventId,
    matchId,
    pairKey: parsed
      ? normalizePairKey(parsed.player1Id, parsed.player2Id)
      : null,
    player1Id: parsed?.player1Id ?? null,
    player2Id: parsed?.player2Id ?? null,
    tournamentId: parsed?.tournamentId ?? null,
    roundId: parsed?.roundId ?? null,
    phase,
    status: textOrNull(row.status),
    score: textOrNull(row.score),
    points: capturedGameText(row),
    indicator: textOrNull(row.indicator),
    servingProviderId,
    provisionalWinnerProviderId,
    sequence: cursor.sequence,
    sequence_source: cursor.sequence_source,
    received_at: receivedAt,
    occurred_at: occurredAtOf(row),
  };
  frame.frame_key = [
    frame.phase,
    frame.score,
    frame.points,
    frame.servingProviderId,
    frame.provisionalWinnerProviderId,
    frame.status,
  ].join("\u001f");
  return { ok: true, frame };
}

/**
 * @param {string} text
 */
export function liveRowsFromNdjson(text) {
  /** @type {Record<string, unknown>[]} */
  const rows = [];
  for (const line of String(text || "").split(/\n/)) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!record || typeof record !== "object") continue;
    if (record.matchId != null) {
      rows.push(record);
      continue;
    }
    const path = String(record.path || "");
    const body =
      typeof record.payload === "string"
        ? record.payload
        : typeof record.body_text === "string"
          ? record.body_text
          : null;
    if (!body || (path && !path.includes("events/live"))) continue;
    try {
      const parsed = JSON.parse(body);
      const receivedAt = record.receivedAt ?? record.captured_at ?? null;
      for (const row of liveEventList(parsed)) {
        rows.push({ ...row, receivedAt, source: "rest" });
      }
    } catch {
      // not a live list
    }
  }
  return rows;
}

/**
 * @param {ReturnType<typeof canonicalLiveFrame> extends { frame: infer F } ? F : never} frame
 * @param {{
 *   matches: Array<{
 *     match_id: string,
 *     match_key: string,
 *     public_ref: string,
 *     tournament_id: string,
 *     tournament_provider_id: string,
 *     provider_match_id?: string | null,
 *     side_a_provider_id?: string | null,
 *     side_b_provider_id?: string | null,
 *     side_a_ref?: string | null,
 *     side_b_ref?: string | null,
 *     officially_settled?: boolean,
 *   }>,
 *   eventMap?: Array<{
 *     match_id: string,
 *     pair_key: string,
 *     socket_event_id?: string | null,
 *     status: string,
 *   }>,
 * }} catalog
 */
export function mapFrameToMatch(frame, catalog) {
  const matches = catalog.matches || [];
  const eventMap = catalog.eventMap || [];
  const byId = new Map(matches.map((match) => [match.match_id, match]));

  /** @type {Set<string>} */
  const fromEvent = new Set();
  if (frame.eventId) {
    for (const row of eventMap) {
      if (row.status !== "mapped" || !row.socket_event_id || !row.match_id) continue;
      if (row.socket_event_id === frame.eventId) fromEvent.add(row.match_id);
    }
  }

  /** @type {Set<string>} */
  const fromPair = new Set();
  if (frame.pairKey && frame.tournamentId) {
    for (const match of matches) {
      if (String(match.tournament_provider_id) !== String(frame.tournamentId)) continue;
      if (!match.side_a_provider_id || !match.side_b_provider_id) continue;
      const pair = normalizePairKey(
        match.side_a_provider_id,
        match.side_b_provider_id
      );
      if (pair === frame.pairKey) fromPair.add(match.match_id);
    }
  }

  let ids;
  if (fromEvent.size && fromPair.size) {
    ids = [...fromEvent].filter((id) => fromPair.has(id));
    if (ids.length === 0) {
      return { status: "ambiguous", reason: "event and pair disagree", match: null };
    }
  } else if (fromEvent.size) {
    ids = [...fromEvent];
  } else if (fromPair.size) {
    ids = [...fromPair];
  } else {
    return { status: "not_found", reason: "no match", match: null };
  }

  if (ids.length !== 1) {
    return { status: "ambiguous", reason: "more than one match", match: null };
  }
  const match = byId.get(ids[0]);
  if (!match) return { status: "not_found", reason: "mapped id missing", match: null };
  return { status: "mapped", reason: null, match };
}

function blankDecision(action, reason, state, disagreement = null) {
  return {
    action,
    reason,
    state,
    officialPatch: null,
    advance: false,
    disagreement,
  };
}

/**
 * Provider player ids become sides once.
 * Both ids must be present and different. Otherwise the map is null.
 * @param {Record<string, unknown> | null | undefined} match
 * @returns {Map<string, "a" | "b"> | null}
 */
export function resolvePlayerSides(match) {
  const a = textOrNull(match?.side_a_provider_id);
  const b = textOrNull(match?.side_b_provider_id);
  if (!a || !b || a === b) return null;
  return new Map([
    [a, "a"],
    [b, "b"],
  ]);
}

/**
 * Look up a side that was already resolved. A miss is null.
 * @param {Map<string, "a" | "b"> | null} sides
 * @param {unknown} providerId
 * @returns {"a" | "b" | null}
 */
export function providerSide(sides, providerId) {
  if (!sides) return null;
  const id = textOrNull(providerId);
  if (!id) return null;
  const side = sides.get(id);
  return side === "a" || side === "b" ? side : null;
}

/**
 * Provider order to MatchRead sides. The live row lists its first player on
 * the left of `score` and `points`; a match can hold that player as side b.
 * @param {Map<string, "a" | "b"> | null} sides
 * @param {unknown} player1ProviderId
 * @returns {"as-is" | "swap" | null} null when the first player is not one of the sides
 *   (an event-mapped frame whose match id does not name the players).
 */
export function scoreOrientation(sides, player1ProviderId) {
  const first = providerSide(sides, player1ProviderId);
  if (first === "a") return "as-is";
  if (first === "b") return "swap";
  return null;
}

/**
 * Canonical `N-N` text (sets joined by commas, or one game) read from side a.
 * An unknown orientation keeps the provider order, as before orientation
 * existed; only a known reversal is swapped.
 * @param {string | null} text
 * @param {"as-is" | "swap" | null} orientation
 * @returns {string | null}
 */
export function orientScoreText(text, orientation) {
  if (text == null) return null;
  if (orientation !== "swap") return text;
  return text
    .split(",")
    .map((part) => {
      const pair = part.split("-");
      return pair.length === 2 ? `${pair[1]}-${pair[0]}` : part;
    })
    .join(",");
}

/**
 * @param {"a" | "b" | null} side
 * @param {Record<string, unknown>} match
 */
export function sideRef(side, match) {
  if (side === "a") return textOrNull(match.side_a_ref);
  if (side === "b") return textOrNull(match.side_b_ref);
  return null;
}

/**
 * A terminal live frame may name a provisional winner.
 * That ref is not an official winner.
 * @param {string} phase
 * @param {"a" | "b" | null} side
 * @param {Record<string, unknown>} match
 */
export function provisionalWinnerRef(phase, side, match) {
  if (phase !== "terminal" && phase !== "provisional_final") return null;
  return sideRef(side, match);
}

/**
 * REST stays the official fact. A live score or winner that differs is recorded
 * and is not written onto matches. Commas and spaces in a score are the same fact.
 * @param {{ score?: unknown, winner?: unknown, public_ref?: unknown } | null | undefined} live
 * @param {{ score?: unknown, winner?: unknown, public_ref?: unknown } | null | undefined} official
 */
export function restLiveDifference(live, official) {
  const liveScore = textOrNull(live?.score);
  const officialScore = textOrNull(official?.score);
  const liveWinner = textOrNull(live?.winner);
  const officialWinner = textOrNull(official?.winner);
  const score = Boolean(liveScore && officialScore && foldScore(liveScore) !== foldScore(officialScore));
  const winner = Boolean(
    liveWinner && officialWinner && foldWinner(liveWinner) !== foldWinner(officialWinner)
  );
  if (!score && !winner) return null;
  return {
    kind: "reconcile",
    name: "live_rest_disagreement",
    payload: {
      public_ref: textOrNull(official?.public_ref) ?? textOrNull(live?.public_ref),
      live_score: liveScore,
      official_score: officialScore,
      live_winner_ref: liveWinner,
      official_winner_ref: officialWinner,
    },
  };
}

/**
 * @param {Record<string, unknown>} frame
 * @param {Record<string, unknown>} match
 * @param {"a" | "b" | null} [provisionalSide]
 */
export function liveRestDisagreement(frame, match, provisionalSide = null) {
  if (!match?.officially_settled) return null;
  return restLiveDifference(
    {
      score: frame?.score,
      winner: sideRef(provisionalSide, match),
      public_ref: match.public_ref,
    },
    {
      score: match.official_score,
      winner: match.winner_ref,
      public_ref: match.public_ref,
    }
  );
}

/** @param {string} value */
function foldScore(value) {
  return value.replace(/,/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** @param {string} value */
function foldWinner(value) {
  return value.trim().toLowerCase().replace(/^(?:atp|wta)-/, "");
}

/**
 * @param {null | Record<string, unknown>} previous
 * @param {{ frame: Record<string, unknown>, match: Record<string, unknown> }} mapped
 */
export function projectLiveFrame(previous, mapped) {
  const frame = mapped.frame;
  const match = mapped.match;
  const sides = resolvePlayerSides(match);
  const serving = providerSide(sides, frame.servingProviderId);
  const provisionalSide = providerSide(sides, frame.provisionalWinnerProviderId);
  if (match.officially_settled) {
    return blankDecision(
      "ignored",
      "already official",
      previous,
      liveRestDisagreement(frame, match, provisionalSide)
    );
  }
  if (frame.phase !== "in_play" && frame.phase !== "suspended" && frame.phase !== "terminal") {
    return blankDecision("ignored", "unknown status", previous);
  }
  if (previous) {
    const prevMs = Date.parse(String(previous.occurred_at || ""));
    const nextMs = Date.parse(String(frame.occurred_at || ""));
    const bothClocks = Number.isFinite(prevMs) && Number.isFinite(nextMs);
    if (bothClocks && nextMs <= prevMs) {
      return blankDecision("ignored", "out of order", previous);
    }
    if (!bothClocks || nextMs <= prevMs) {
      const prevRank = SEQUENCE_RANK[previous.sequence_source] || 0;
      const nextRank = SEQUENCE_RANK[frame.sequence_source] || 0;
      if (frame.sequence_source !== previous.sequence_source || prevRank !== nextRank) {
        return blankDecision("ignored", "sequence source changed", previous);
      }
      if (frame.sequence < previous.sequence) {
        return blankDecision("ignored", "out of order", previous);
      }
      if (frame.sequence === previous.sequence) {
        if (frame.frame_key === previous.frame_key) {
          return blankDecision("duplicate", "same frame", previous);
        }
        return blankDecision("ignored", "same sequence, different frame", previous);
      }
    }
  }

  const phase = frame.phase === "terminal" ? "provisional_final" : frame.phase;
  const receipt = frame.received_at;
  // Core requires a receipt. A missing one stays null on the stored row.
  const canonical = normalizeLiveMatchState({
    matchId: match.match_id == null ? "" : String(match.match_id),
    tournamentId: match.tournament_id == null ? "" : String(match.tournament_id),
    publicRef: match.public_ref == null ? "" : String(match.public_ref),
    phase,
    sets: frame.score,
    game: frame.points,
    serving: frame.phase === "terminal" ? null : serving,
    provisionalWinner: provisionalWinnerRef(frame.phase, provisionalSide, match),
    occurredAt: frame.sequence_source === "updatedAt" ? frame.occurred_at ?? null : null,
    receivedAt: receipt || "1970-01-01T00:00:00.000Z",
  });
  if (!canonical) return blankDecision("ignored", "not a live state", previous);
  // Sets and game are stored from side a when the first player is placeable.
  const orientation = scoreOrientation(sides, frame.player1Id);
  const state = {
    match_id: canonical.matchId,
    match_key: match.match_key,
    tournament_id: canonical.tournamentId,
    public_ref: canonical.publicRef,
    phase: canonical.phase,
    score_text: orientScoreText(canonical.sets, orientation),
    points_text: orientScoreText(canonical.game, orientation),
    flag: canonical.flag,
    stats: null,
    serving_side: canonical.serving,
    provisional_winner_ref: canonical.provisionalWinner,
    sequence: frame.sequence,
    sequence_source: frame.sequence_source,
    frame_key: frame.frame_key,
    source: frame.source,
    received_at: receipt ? canonical.receivedAt : null,
    occurred_at: canonical.occurredAt,
  };
  return blankDecision("apply", null, state);
}

/**
 * Row written to live_match_state. No official columns.
 * @param {Record<string, unknown>} state
 */
export function liveStateRow(state) {
  return {
    match_id: state.match_id,
    tournament_id: state.tournament_id,
    public_ref: state.public_ref,
    phase: state.phase,
    score_text: state.score_text,
    points_text: state.points_text,
    serving_side: state.serving_side,
    provisional_winner_ref: state.provisional_winner_ref,
    sequence: state.sequence,
    sequence_source: state.sequence_source,
    frame_key: state.frame_key,
    source: state.source,
    received_at: state.received_at,
    occurred_at: state.occurred_at ?? null,
    flag: state.flag ?? null,
    stats: null,
  };
}

/**
 * @param {unknown[]} frames
 * @param {Parameters<typeof mapFrameToMatch>[1]} catalog
 */
export function replayLiveFrames(frames, catalog) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byMatch = new Map();
  const health = {
    applied: 0,
    duplicate: 0,
    ignored: 0,
    unmapped: 0,
    ambiguous: 0,
    disagreements: 0,
  };
  /** @type {Array<Record<string, unknown>>} */
  const disagreements = [];
  /** @type {Array<ReturnType<typeof unknownLiveRecord>>} */
  const unknown = [];
  /** @type {Array<Record<string, unknown>>} */
  const steps = [];
  for (const raw of frames) {
    const canon = canonicalLiveFrame(raw);
    if (!canon.ok) {
      health.ignored += 1;
      steps.push(blankDecision("ignored", canon.reason, null));
      continue;
    }
    const mapped = mapFrameToMatch(canon.frame, catalog);
    if (mapped.status === "ambiguous") {
      health.ambiguous += 1;
      unknown.push(unknownLiveRecord(raw, mapped.reason || "more than one match"));
      steps.push(blankDecision("ambiguous", mapped.reason, null));
      continue;
    }
    if (mapped.status !== "mapped" || !mapped.match) {
      health.unmapped += 1;
      unknown.push(unknownLiveRecord(raw, mapped.reason || "no match"));
      steps.push(blankDecision("unmapped", mapped.reason, null));
      continue;
    }
    const previous = byMatch.get(mapped.match.match_id) ?? null;
    const next = projectLiveFrame(previous, { frame: canon.frame, match: mapped.match });
    if (next.action === "apply") {
      health.applied += 1;
      byMatch.set(mapped.match.match_id, next.state);
    } else if (next.action === "duplicate") {
      health.duplicate += 1;
    } else {
      health.ignored += 1;
    }
    if (next.disagreement) {
      health.disagreements += 1;
      disagreements.push(next.disagreement);
    }
    steps.push(next);
  }
  return { states: [...byMatch.values()], health, steps, disagreements, unknown };
}

/**
 * Structured log plus the raw payload. No match id and no display-name key.
 * @param {unknown} raw
 * @param {string} reason
 */
export function unknownLiveRecord(raw, reason) {
  const record = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const providerEventId = textOrNull(record.id);
  const tour = record.tourType === "atp" || record.tourType === "wta" ? record.tourType : null;
  return {
    log: {
      kind: "live",
      name: "unmapped_event",
      payload: {
        reason,
        provider_event_id: providerEventId,
        tour,
      },
    },
    archive: {
      reason,
      provider_event_id: providerEventId,
      tour,
      payload: raw && typeof raw === "object" ? raw : { value: raw ?? null },
    },
  };
}

/**
 * The provider socket stays closed. A written plan decision is still required,
 * and no captured handshake shows how the token is attached.
 * @param {NodeJS.ProcessEnv} [env]
 */
export const LIVE_STALE_MS = 45_000;

/**
 * In-play, stale, and provisional marks from a canonical frame.
 * Eligibility tier is not on the live row, and indicator is not a server.
 * @param {Record<string, unknown>} frame
 * @param {number} [now]
 */
export function deriveLiveFlags(frame, now = Date.now()) {
  const phase = frame?.phase;
  const observed = Date.parse(String(frame?.received_at || ""));
  const age = Number.isFinite(observed) ? now - observed : 0;
  const stale = Number.isFinite(observed) && age > LIVE_STALE_MS;
  const inPlay = phase === "in_play" || phase === "suspended";
  return {
    live: phase === "in_play" && !stale,
    provisional: phase === "terminal" || phase === "provisional_final",
    stale: inPlay && stale,
    serving: false,
  };
}

/**
 * Normalize one live HTTP body into canonical frames. Does not open a socket.
 * @param {unknown} body
 * @param {string} [receivedAt]
 */
export function normalizeLivePayload(body, receivedAt = new Date().toISOString()) {
  let parsed = body;
  if (typeof body === "string") {
    parsed = JSON.parse(body);
  }
  return liveEventList(parsed).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    return [
      canonicalLiveFrame({
        ...row,
        receivedAt: row.receivedAt ?? receivedAt,
        source: row.source === "replay" ? "replay" : "rest",
      }),
    ];
  });
}

export function providerSocketEnabled(env = process.env) {
  return env.MATCHREAD_LIVE_SOCKET === "1";
}

export function openProviderSocket(env = process.env) {
  if (!providerSocketEnabled(env)) {
    const error = new Error("provider socket is off");
    error.code = "SOCKET_OFF";
    throw error;
  }
  const error = new Error("provider socket handshake is not captured");
  error.code = "SOCKET_UNVERIFIED";
  throw error;
}
