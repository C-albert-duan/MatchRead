/**
 * BANKED, PROJECTED and CEILING for one bracket.
 *
 * BANKED is what official results have already awarded. It never falls.
 * CEILING is the most the bracket can still score. Official progression
 * never raises it.
 * PROJECTED is BANKED plus the live matches the picked player leads right
 * now. It is computed on read, never stored, and is not a probability.
 *
 * Weights are the product's own (`roundWeight`, champion bonus), so BANKED
 * equals `gradeBracket(...).score` at every point.
 */

import {
  buildRoundStructure,
  matchKey,
  type BracketPicks,
  type DrawSeat,
} from "../bracket";
import type { OfficialResults } from "../grade";
import type { Authoritative } from "../live-trust";
import { roundWeight } from "../scoring";
import { setWinner } from "./point-flag";
import type { ServingSide } from "./state";

type Official = Authoritative<OfficialResults>;

/** A live match as the Ceiling needs it: who is on which side, and the set score. */
export type LiveLead = {
  sideARef: string | null;
  sideBRef: string | null;
  /** Canonical sets, such as `6-4,3-2`. Left is side a. */
  sets: string | null;
};

export type CeilingInput = {
  drawSize: number;
  seats: readonly DrawSeat[];
  picks: BracketPicks;
  official: Official;
  /** Keyed by match key. Only matches in play. */
  live?: Readonly<Record<string, LiveLead>>;
};

export type CeilingTriad = {
  banked: number;
  projected: number;
  ceiling: number;
};

export type ForwardStatus = "settled" | "standing" | "dead" | "open";

function pair(text: string): [number, number] | null {
  const parts = text.split("-");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return null;
  return [Number(parts[0]), Number(parts[1])];
}

/**
 * Who leads on the score as it stands: sets first, then games in the open set.
 * Null when level, unparseable, or absent. Never a probability.
 */
export function leader(sets: string | null | undefined): ServingSide | null {
  if (!sets || !/^\d+-\d+(,\d+-\d+)*$/.test(sets)) return null;
  const games = sets.split(",").map(pair) as [number, number][];
  let a = 0;
  let b = 0;
  let open: [number, number] | null = null;
  for (const set of games) {
    const won = setWinner(set);
    if (won === "a") a++;
    else if (won === "b") b++;
    else open = set;
  }
  if (a !== b) return a > b ? "a" : "b";
  if (!open || open[0] === open[1]) return null;
  return open[0] > open[1] ? "a" : "b";
}

function leaderRef(lead: LiveLead | undefined): string | null {
  if (!lead) return null;
  const side = leader(lead.sets);
  if (side === "a") return lead.sideARef;
  if (side === "b") return lead.sideBRef;
  return null;
}

function decided(official: Official, key: string): boolean {
  const o = official[key];
  return Boolean(o && (o.voided || o.winnerRef));
}

/**
 * Players out of the draw. A player is out once any match on their seat path
 * has a different official winner. A void eliminates nobody.
 */
export function eliminatedRefs(
  drawSize: number,
  seats: readonly DrawSeat[],
  official: Official
): Set<string> {
  const rounds = buildRoundStructure(drawSize);
  const out = new Set<string>();
  for (const seat of seats) {
    const ref = seat.player_id;
    if (seat.kind !== "player" || !ref) continue;
    for (const round of rounds) {
      const o = official[matchKey(round.index, seat.position >> (round.index + 1))];
      if (o && !o.voided && o.winnerRef && o.winnerRef !== ref) {
        out.add(ref);
        break;
      }
    }
  }
  return out;
}

/** One pass over the bracket. An eliminated pick contributes nothing forward. */
export function ceilingMaths(input: CeilingInput): CeilingTriad {
  const { drawSize, picks, official } = input;
  const rounds = buildRoundStructure(drawSize);
  const lastRound = rounds.length - 1;
  const out = eliminatedRefs(drawSize, input.seats, official);
  const live = input.live ?? {};

  let banked = 0;
  let forward = 0;
  let leading = 0;

  const score = (key: string, pick: string | undefined, weight: number) => {
    if (!pick) return;
    if (decided(official, key)) {
      const o = official[key];
      if (!o.voided && o.winnerRef === pick) banked += weight;
      return;
    }
    if (out.has(pick)) return;
    forward += weight;
    if (leaderRef(live[key]) === pick) leading += weight;
  };

  for (const round of rounds) {
    const weight = roundWeight(round.index);
    for (const match of round.matches) score(match.key, picks[match.key], weight);
  }
  const finalKey = matchKey(lastRound, 0);
  score(finalKey, picks[finalKey], roundWeight(lastRound));

  return { banked, projected: banked + leading, ceiling: banked + forward };
}

/** State of one pick for the forward graph. */
export function forwardStatus(input: CeilingInput, key: string): ForwardStatus {
  if (decided(input.official, key)) return "settled";
  const pick = input.picks[key];
  if (!pick) return "open";
  return eliminatedRefs(input.drawSize, input.seats, input.official).has(pick)
    ? "dead"
    : "standing";
}

/**
 * Ceiling lost if `loserRef` loses match `key`: every undecided pick naming
 * them from that round on, plus the champion bonus when they are the champion.
 */
export function ceilingDeltaIfLost(
  input: CeilingInput,
  key: string,
  loserRef: string
): { points: number; affectedForwardNodes: string[] } {
  const at = /^r(\d+)-m\d+$/.exec(key);
  if (!at) return { points: 0, affectedForwardNodes: [] };
  const fromRound = Number(at[1]);
  const rounds = buildRoundStructure(input.drawSize);
  const lastRound = rounds.length - 1;
  if (eliminatedRefs(input.drawSize, input.seats, input.official).has(loserRef)) {
    return { points: 0, affectedForwardNodes: [] };
  }

  let points = 0;
  const affectedForwardNodes: string[] = [];
  for (const round of rounds) {
    if (round.index < fromRound) continue;
    for (const match of round.matches) {
      if (input.picks[match.key] !== loserRef || decided(input.official, match.key)) continue;
      points += roundWeight(round.index);
      affectedForwardNodes.push(match.key);
    }
  }
  const finalKey = matchKey(lastRound, 0);
  if (input.picks[finalKey] === loserRef && !decided(input.official, finalKey)) {
    points += roundWeight(lastRound);
  }
  return { points, affectedForwardNodes };
}
