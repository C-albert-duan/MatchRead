/**
 * Regression for check/V3-M4-DOD.md F-3: `upside` is the most a bracket can
 * still add. It used to count only players who had already won in the
 * furthest round played, so it read 0 before play (every bracket showed
 * "In Trouble") and undercounted until each round finished.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { bracketHealth, perfectPicksRemaining } from "./engagement.ts";
import { gradeBracket, type BracketPicks } from "./grade.ts";
import { ceilingMaths } from "./live/ceiling.ts";
import { buildRoundStructure, matchKey } from "./bracket.ts";
import { buildSyntheticBracket16 } from "./synthetic-bracket.ts";

const edge = await import("../../../supabase/functions/_shared/core.js");

const sheet = buildSyntheticBracket16();
const ROUNDS = buildRoundStructure(16);
const seat = (position: number) => sheet.seats.find((item) => item.position === position)!.player_id!;

type Official = Record<string, { winnerRef: string | null; voided?: boolean }>;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sides(official: Official, round: number, index: number): [string | null, string | null] {
  if (round === 0) return [seat(index * 2), seat(index * 2 + 1)];
  const feeder = (i: number) => official[matchKey(round - 1, i)]?.winnerRef ?? null;
  return [feeder(index * 2), feeder(index * 2 + 1)];
}

function picksFrom(choose: (a: string, b: string) => string): BracketPicks {
  const picks: BracketPicks = {};
  for (const round of ROUNDS) {
    for (const match of round.matches) {
      const a = round.index === 0 ? seat(match.indexInRound * 2) : picks[matchKey(round.index - 1, match.indexInRound * 2)];
      const b = round.index === 0 ? seat(match.indexInRound * 2 + 1) : picks[matchKey(round.index - 1, match.indexInRound * 2 + 1)];
      picks[match.key] = choose(a, b);
    }
  }
  return picks;
}

const chalk = picksFrom((a) => a);

function remaining(picks: BracketPicks, official: Official): number {
  const triad = ceilingMaths({ drawSize: 16, seats: sheet.seats, picks, official });
  return triad.ceiling - triad.banked;
}

test("before play, upside is the whole bracket and health is not 'In Trouble'", () => {
  const grade = gradeBracket({ drawSize: 16, picks: chalk, official: {} });
  assert.equal(grade.score, 0);
  assert.equal(grade.upside, grade.maxScore);
  assert.equal(grade.championAlive, true);
  assert.equal(
    bracketHealth({ score: 0, maxScore: grade.maxScore, upside: grade.upside, championAlive: grade.championAlive }),
    "Elite"
  );
});

test("early in a round, picks that have not played yet still count", () => {
  const official: Official = { "r0-m0": { winnerRef: seat(0) } };
  const grade = gradeBracket({ drawSize: 16, picks: chalk, official });
  assert.equal(grade.score, 1);
  assert.equal(grade.upside, grade.maxScore - 1);
  assert.equal(grade.upside, remaining(chalk, official));
});

test("a beaten pick stops counting at once, in every later round it was named", () => {
  // Chalk picks seat 0 to win everything; seat 1 beats them in the first match.
  const official: Official = { "r0-m0": { winnerRef: seat(1) } };
  const grade = gradeBracket({ drawSize: 16, picks: chalk, official });
  assert.equal(grade.championAlive, false);
  assert.equal(grade.upside, remaining(chalk, official));
  // Lost: r0-m0 (1), r1-m0 (2), r2-m0 (4), r3-m0 (8) and the champion bonus (8).
  assert.equal(grade.upside, grade.maxScore - 23);
});

test("upside equals Ceiling minus Banked at every step of 200 replayed draws", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const next = rng(seed);
    const picks = picksFrom((a, b) => (next() < 0.5 ? a : b));
    const official: Official = {};
    const open = () =>
      ROUNDS.flatMap((round) => round.matches)
        .filter((match) => !official[match.key])
        .filter((match) => sides(official, match.round, match.indexInRound).every(Boolean));
    for (;;) {
      const grade = gradeBracket({ drawSize: 16, picks, official });
      assert.equal(grade.upside, remaining(picks, official), `seed ${seed}`);
      assert.ok(grade.score + grade.upside <= grade.maxScore, `seed ${seed}: within the maximum`);
      const copied = edge.gradeBracket({
        drawSize: 16,
        picks,
        official: Object.fromEntries(
          Object.entries(official).map(([key, row]) => [key, { winnerPlayerId: row.winnerRef, voided: row.voided }])
        ),
      });
      assert.equal(copied.upside, grade.upside, `seed ${seed}: Edge copy`);
      assert.equal(copied.championAlive, grade.championAlive, `seed ${seed}: Edge copy champion`);
      const playable = open();
      if (!playable.length) break;
      const match = playable[Math.floor(next() * playable.length)];
      const [a, b] = sides(official, match.round, match.indexInRound);
      official[match.key] = { winnerRef: next() < 0.5 ? a : b };
    }
  }
});

test("perfect picks remaining counts unplayed picks early in a round", () => {
  const official: Official = { "r0-m0": { winnerRef: seat(0) } };
  // 15 matches, one decided: 14 open, every chalk pick still standing.
  assert.equal(perfectPicksRemaining({ picks: chalk, official, drawSize: 16 }), 14);
  const upset: Official = { "r0-m0": { winnerRef: seat(1) } };
  // Seat 0 is named at r1-m0, r2-m0 and r3-m0; all three are gone.
  assert.equal(perfectPicksRemaining({ picks: chalk, official: upset, drawSize: 16 }), 11);
});
