/**
 * Captured provider frame → canonical live state.
 * Reads the observed live-list shape, then stops.
 * Does not write a row, settle a match, advance a bracket, query a database,
 * or format a sentence.
 * `pointFlags` stays null. A captured row has no sets-to-win and no server id,
 * and this function does not invent a match point.
 */

import { normalizeLiveMatchState } from "../../core/src/live/normalize.ts";
import {
  canonicalGame,
  canonicalLiveFrame,
  canonicalSets,
  liveFlag,
  mapFrameToMatch,
  provisionalWinnerRef,
  providerSide,
  resolvePlayerSides,
} from "./live-frame.js";

/**
 * @param {unknown} input
 * @param {Parameters<typeof mapFrameToMatch>[1]} catalog
 */
export function normalizeCapturedFrame(input, catalog) {
  const canon = canonicalLiveFrame(input);
  if (!canon.ok) return { ok: false, reason: canon.reason };
  const frame = canon.frame;
  if (frame.phase !== "in_play" && frame.phase !== "suspended" && frame.phase !== "terminal") {
    return { ok: false, reason: "unknown status" };
  }
  const mapped = mapFrameToMatch(frame, catalog);
  if (mapped.status === "not_found") return { ok: false, reason: "unmapped" };
  if (mapped.status !== "mapped" || !mapped.match) return { ok: false, reason: "ambiguous" };
  const match = mapped.match;
  if (match.officially_settled) return { ok: false, reason: "already official" };

  const phase = frame.phase === "terminal" ? "provisional_final" : frame.phase;
  const sides = resolvePlayerSides(match);
  const provisionalSide = providerSide(sides, frame.provisionalWinnerProviderId);
  const serving = providerSide(sides, frame.servingProviderId);
  const draft = {
    matchId: match.match_id == null ? "" : String(match.match_id),
    tournamentId: match.tournament_id == null ? "" : String(match.tournament_id),
    publicRef: match.public_ref == null ? "" : String(match.public_ref),
    phase,
    sets: frame.score,
    game: frame.points,
    serving,
    provisionalWinner: provisionalWinnerRef(phase, provisionalSide, match),
    occurredAt: frame.occurred_at ?? null,
    receivedAt: frame.received_at,
  };
  const canonical = normalizeLiveMatchState(draft);
  if (canonical) return { ok: true, state: { ...canonical, pointFlags: null } };
  if (draft.receivedAt) return { ok: false, reason: "not a live state" };
  return {
    ok: true,
    state: {
      matchId: draft.matchId,
      tournamentId: draft.tournamentId,
      publicRef: draft.publicRef,
      phase,
      sets: canonicalSets(draft.sets),
      game: canonicalGame(draft.game),
      serving: serving === "a" || serving === "b" ? serving : null,
      flag: liveFlag(phase),
      pointFlags: null,
      provisionalWinner: draft.provisionalWinner,
      occurredAt: draft.occurredAt,
      receivedAt: null,
    },
  };
}
