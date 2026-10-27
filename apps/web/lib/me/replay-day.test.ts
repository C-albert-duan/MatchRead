/**
 * A whole tournament day replayed through the My Tennis view, frame by frame:
 * every match goes live (random leader), then settles. Asserts the Ceiling
 * invariants on what the page would render, not just on core.
 *
 * The prototype TIMELINE fixture is seven provider frames for one match, so it
 * cannot drive a bracket; this replays the synthetic 16-draw instead.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRoundStructure,
  buildSyntheticBracket16,
  DEFAULT_IMPORTANCE,
  gradeBracket,
  type BracketPicks,
} from "@matchread/core";
import type { LiveDisplayState } from "../live/view.ts";
import { assembleMyTennis, type MyTennisContext, type MyTennisMatch } from "./my-tennis.ts";
import { stageModel } from "./stage-policy.ts";

const sheet = buildSyntheticBracket16();
const ROUNDS = buildRoundStructure(16);
const seat = (position: number) => sheet.seats.find((item) => item.position === position)!.player_id!;
const NOW = new Date("2026-08-10T09:00:00.000Z");

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

function randomPicks(next: () => number): BracketPicks {
  const picks: BracketPicks = {};
  for (const round of ROUNDS) {
    for (const match of round.matches) {
      const a = round.index === 0 ? seat(match.indexInRound * 2) : picks[`r${round.index - 1}-m${match.indexInRound * 2}`];
      const b = round.index === 0 ? seat(match.indexInRound * 2 + 1) : picks[`r${round.index - 1}-m${match.indexInRound * 2 + 1}`];
      picks[match.key] = next() < 0.5 ? a : b;
    }
  }
  return picks;
}

/** A fresh draw: first-round pairs known, nothing played, every match timed. */
function freshMatches(): MyTennisMatch[] {
  return ROUNDS.flatMap((round) =>
    round.matches.map((match, i) => ({
      key: match.key,
      externalRef: `syn16-${match.key}`,
      round: round.index,
      sideARef: round.index === 0 ? seat(match.indexInRound * 2) : null,
      sideALastName: null,
      sideBRef: round.index === 0 ? seat(match.indexInRound * 2 + 1) : null,
      sideBLastName: null,
      winnerRef: null,
      voided: false,
      officialScore: null,
      scheduledAt: new Date(NOW.getTime() + (round.index * 8 + i + 1) * 3_600_000).toISOString(),
      hasTime: true,
      session: "day" as const,
      court: null,
    }))
  );
}

function liveRow(ref: string, sets: string): LiveDisplayState {
  return {
    publicRef: ref,
    phase: "in_play",
    sets: sets as LiveDisplayState["sets"],
    game: "15-0" as LiveDisplayState["game"],
    serving: null,
    flag: "live",
    provisionalWinner: null,
    occurredAt: null,
    receivedAt: NOW.toISOString(),
  };
}

test("I1-I4 hold on the rendered view at every frame of a replayed day", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const next = rng(seed);
    const brackets = [
      { bracketId: "b-1", leagueId: "league-a", tournamentRef: "syn-16", picks: randomPicks(next) },
      { bracketId: "b-2", leagueId: "league-b", tournamentRef: "syn-16", picks: randomPicks(next) },
    ];
    const matches = freshMatches();
    const byKey = new Map(matches.map((match) => [match.key, match]));
    const context = (live: Record<string, LiveDisplayState>): MyTennisContext => ({
      brackets,
      tournaments: {
        "syn-16": { id: "t-uuid", ref: "syn-16", name: "Synthetic", drawSize: 16, setsToWin: 2, seats: sheet.seats, matches },
      },
      live,
    });

    let previous = assembleMyTennis(context({}), DEFAULT_IMPORTANCE);
    assert.equal(stageModel(previous, NOW).treatment, "morning", `seed ${seed}: the day opens before play`);
    for (const triad of previous.triads) assert.equal(triad.banked, 0);

    for (const round of ROUNDS) {
      for (const ref of round.matches) {
        const match = byKey.get(ref.key)!;
        const sets = ["6-4,3-2", "4-6,3-3", "6-4,4-6,2-2", "2-6,1-0"][Math.floor(next() * 4)];

        // Frame: the match goes live. Banked must not move on a live frame.
        const liveView = assembleMyTennis(context({ [match.externalRef]: liveRow(match.externalRef, sets) }), DEFAULT_IMPORTANCE);
        for (const [i, triad] of liveView.triads.entries()) {
          assert.equal(triad.banked, previous.triads[i].banked, `seed ${seed}: a live frame never banks`);
          assert.ok(triad.ceiling <= previous.triads[i].ceiling, `seed ${seed}: I2 on a live frame`);
          assert.ok(triad.banked <= triad.projected && triad.projected <= triad.ceiling, `seed ${seed}: I3 live`);
        }
        const liveRows = liveView.rows.filter((row) => row.status === "live");
        assert.ok(liveRows.every((row) => row.matchRef === match.externalRef), `seed ${seed}: one live row`);

        // Frame: the official result lands and the winner takes the next seat.
        const winner = next() < 0.5 ? match.sideARef! : match.sideBRef!;
        match.winnerRef = winner;
        match.officialScore = "6-4 6-4";
        const parentKey = `r${round.index + 1}-m${ref.indexInRound >> 1}`;
        const parent = byKey.get(parentKey);
        if (parent) {
          if (ref.indexInRound % 2 === 0) parent.sideARef = winner;
          else parent.sideBRef = winner;
        }

        const settled = assembleMyTennis(context({}), DEFAULT_IMPORTANCE);
        const official = Object.fromEntries(
          matches.filter((item) => item.winnerRef).map((item) => [item.key, { winnerRef: item.winnerRef }])
        );
        for (const [i, triad] of settled.triads.entries()) {
          const before = previous.triads[i];
          assert.ok(triad.banked >= before.banked, `seed ${seed}: I1 banked never falls`);
          assert.ok(triad.ceiling <= before.ceiling, `seed ${seed}: I2 ceiling never rises`);
          assert.ok(triad.banked <= triad.projected && triad.projected <= triad.ceiling, `seed ${seed}: I3`);
          assert.equal(
            triad.banked,
            gradeBracket({ drawSize: 16, picks: brackets[i].picks, official }).score,
            `seed ${seed}: banked equals settlement grading`
          );
        }
        // I4: no open row may still treat an eliminated pick as standing.
        for (const row of settled.rows) {
          if (row.status === "final") continue;
          for (const reason of row.consequence.reasons) {
            if (reason.kind !== "forward" || reason.params.state !== "open") continue;
            const loser = matches.some(
              (item) =>
                item.winnerRef &&
                (item.sideARef === reason.params.playerRef || item.sideBRef === reason.params.playerRef) &&
                item.winnerRef !== reason.params.playerRef
            );
            assert.equal(loser, false, `seed ${seed}: I4 ${String(reason.params.playerRef)} is out`);
          }
        }
        previous = settled;
      }
    }

    const end = stageModel(previous, new Date(NOW.getTime() + 48 * 3_600_000));
    assert.ok(["reckoning", "empty"].includes(end.treatment), `seed ${seed}: the day closes settled`);
    for (const triad of previous.triads) assert.equal(triad.ceiling, triad.banked, `seed ${seed}: nothing left open`);
  }
});
