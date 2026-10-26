import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRoundStructure, matchKey, type BracketPicks } from "../bracket.ts";
import { gradeBracket, maxBracketScore, type OfficialResults } from "../grade.ts";
import { buildSyntheticBracket16 } from "../synthetic-bracket.ts";
import {
  ceilingDeltaIfLost,
  ceilingMaths,
  eliminatedRefs,
  forwardStatus,
  leader,
  type CeilingInput,
  type LiveLead,
} from "./ceiling.ts";

const sheet = buildSyntheticBracket16();
const DRAW = sheet.drawSize;
const ROUNDS = buildRoundStructure(DRAW);
const FINAL = matchKey(ROUNDS.length - 1, 0);

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

function seatRef(position: number): string {
  const seat = sheet.seats.find((item) => item.position === position);
  if (!seat?.player_id) throw new Error(`no player at ${position}`);
  return seat.player_id;
}

/** Entrants of a match from a winners map. Round 0 reads the seats. */
function entrants(winners: Record<string, string>, round: number, index: number): [string | null, string | null] {
  if (round === 0) return [seatRef(index * 2), seatRef(index * 2 + 1)];
  return [
    winners[matchKey(round - 1, index * 2)] ?? null,
    winners[matchKey(round - 1, index * 2 + 1)] ?? null,
  ];
}

/** A complete, consistent bracket: every pick is one of its feeders' picks. */
function randomPicks(next: () => number): BracketPicks {
  const picks: BracketPicks = {};
  for (const round of ROUNDS) {
    for (const match of round.matches) {
      const [a, b] = entrants(picks, round.index, match.indexInRound);
      picks[match.key] = (next() < 0.5 ? a : b) as string;
    }
  }
  return picks;
}

function input(picks: BracketPicks, official: OfficialResults, live?: Record<string, LiveLead>): CeilingInput {
  return { drawSize: DRAW, seats: sheet.seats, picks, official, live };
}

test("leader reads sets first, then games in the open set", () => {
  assert.equal(leader("6-4,3-2"), "a");
  assert.equal(leader("4-6,3-3"), "b");
  assert.equal(leader("6-4,4-6,2-3"), "b");
  assert.equal(leader("6-4,4-6,2-2"), null);
  assert.equal(leader("7-6,0-0"), "a");
  assert.equal(leader("6-6"), null);
  assert.equal(leader(null), null);
  assert.equal(leader("6-4,x"), null);
});

test("an untouched complete bracket has nothing banked and the full ceiling", () => {
  const picks = randomPicks(rng(7));
  const triad = ceilingMaths(input(picks, {}));
  assert.deepEqual(triad, { banked: 0, projected: 0, ceiling: maxBracketScore(DRAW) });
});

test("an eliminated champion zeroes every forward node naming them, in one pass", () => {
  const picks = randomPicks(rng(11));
  const champion = picks[FINAL];
  const firstKey = ROUNDS[0].matches.find((match) => picks[match.key] === champion)!.key;
  const before = ceilingMaths(input(picks, {}));
  const delta = ceilingDeltaIfLost(input(picks, {}), firstKey, champion);
  const named = Object.entries(picks).filter(([, ref]) => ref === champion).map(([key]) => key);
  assert.deepEqual([...delta.affectedForwardNodes].sort(), [...named].sort());

  const index = Number(firstKey.split("-m")[1]);
  const [a, b] = entrants({}, 0, index);
  const official: OfficialResults = { [firstKey]: { winnerRef: a === champion ? b : a } };
  const after = ceilingMaths(input(picks, official));
  assert.equal(before.ceiling - after.ceiling, delta.points);
  assert.ok(eliminatedRefs(DRAW, sheet.seats, official).has(champion));
  for (const key of named) {
    if (key === firstKey) continue;
    assert.equal(forwardStatus(input(picks, official), key), "dead");
  }
});

test("a void scores nothing and eliminates nobody", () => {
  const picks = randomPicks(rng(3));
  const key = ROUNDS[0].matches[0].key;
  const official: OfficialResults = { [key]: { winnerRef: null, voided: true } };
  const triad = ceilingMaths(input(picks, official));
  assert.equal(triad.banked, 0);
  assert.equal(triad.ceiling, maxBracketScore(DRAW) - 1);
  assert.equal(eliminatedRefs(DRAW, sheet.seats, official).size, 0);
  assert.equal(forwardStatus(input(picks, official), key), "settled");
});

test("I1-I4 hold at every frame of randomised tournaments", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const next = rng(seed);
    const picks = randomPicks(next);
    /** Who actually advanced, voided or not. */
    const advanced: Record<string, string> = {};
    const official: OfficialResults = {};
    let previous = ceilingMaths(input(picks, official));

    const pending = new Set(ROUNDS.flatMap((round) => round.matches.map((match) => match.key)));
    while (pending.size) {
      const ready = [...pending].filter((key) => {
        const [r, m] = key.slice(1).split("-m").map(Number);
        const [a, b] = entrants(advanced, r, m);
        return a && b;
      });
      const key = ready[Math.floor(next() * ready.length)];
      pending.delete(key);
      const [r, m] = key.slice(1).split("-m").map(Number);
      const [a, b] = entrants(advanced, r, m) as [string, string];
      const winner = next() < 0.5 ? a : b;
      advanced[key] = winner;
      official[key] = next() < 0.05 ? { winnerRef: null, voided: true } : { winnerRef: winner };

      const live: Record<string, LiveLead> = {};
      for (const open of pending) {
        const [lr, lm] = open.slice(1).split("-m").map(Number);
        const [la, lb] = entrants(advanced, lr, lm);
        if (!la || !lb || next() < 0.5) continue;
        const sets = ["6-4,3-2", "4-6,3-3", "6-4,4-6,2-2", "1-0"][Math.floor(next() * 4)];
        live[open] = { sideARef: la, sideBRef: lb, sets };
      }

      const now = ceilingMaths(input(picks, official, live));
      const graded = gradeBracket({ drawSize: DRAW, picks, official });
      assert.equal(now.banked, graded.score, `seed ${seed}: banked equals gradeBracket`);
      assert.ok(now.banked >= previous.banked, `seed ${seed}: I1 banked never falls`);
      assert.ok(now.ceiling <= previous.ceiling, `seed ${seed}: I2 ceiling never rises`);
      assert.ok(
        now.banked <= now.projected && now.projected <= now.ceiling,
        `seed ${seed}: I3 banked <= projected <= ceiling`
      );

      const out = eliminatedRefs(DRAW, sheet.seats, official);
      for (const [pickKey, ref] of Object.entries(picks)) {
        if (out.has(ref) && forwardStatus(input(picks, official), pickKey) !== "settled") {
          assert.equal(forwardStatus(input(picks, official), pickKey), "dead", `seed ${seed}: I4`);
        }
      }
      previous = ceilingMaths(input(picks, official));
    }
    assert.equal(previous.ceiling, previous.banked, `seed ${seed}: a finished draw has no upside`);
  }
});

test("the same input gives the same triad (I5)", () => {
  const picks = randomPicks(rng(21));
  const official: OfficialResults = { [ROUNDS[0].matches[0].key]: { winnerRef: picks[ROUNDS[0].matches[0].key] } };
  const live = { [ROUNDS[0].matches[1].key]: { sideARef: seatRef(2), sideBRef: seatRef(3), sets: "6-4,1-0" } };
  assert.deepEqual(ceilingMaths(input(picks, official, live)), ceilingMaths(input(picks, official, live)));
});
