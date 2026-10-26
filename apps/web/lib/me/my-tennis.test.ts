import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRoundStructure,
  buildSyntheticBracket16,
  DEFAULT_IMPORTANCE,
  gradeBracket,
  type BracketPicks,
} from "@matchread/core";
import { parseImportanceConfig } from "../../server/repositories/app-config.ts";
import type { LiveDisplayState } from "../live/view.ts";
import { assembleMyTennis, type MyTennisContext, type MyTennisTournament } from "./my-tennis.ts";

const sheet = buildSyntheticBracket16();
const names = new Map(sheet.players.map((player) => [player.ref, player.lastName]));

const tournament: MyTennisTournament = {
  ref: "syn-16",
  name: "Synthetic Bracket",
  drawSize: 16,
  seats: sheet.seats,
  matches: sheet.matches.map((match) => ({
    key: match.key,
    externalRef: match.externalRef,
    round: match.round,
    sideARef: match.sideARef,
    sideALastName: match.sideARef ? names.get(match.sideARef) ?? null : null,
    sideBRef: match.sideBRef,
    sideBLastName: match.sideBRef ? names.get(match.sideBRef) ?? null : null,
    winnerRef: match.winnerRef,
    voided: match.voided,
    officialScore: match.officialScore,
    scheduledAt: match.scheduledAt,
    hasTime: match.hasTime,
    session: match.session,
    court: match.court,
  })),
};

/** Picks the left (or right) entrant everywhere. Left: p01 is the champion. */
function picks(side: "a" | "b"): BracketPicks {
  const out: BracketPicks = {};
  for (const round of buildRoundStructure(16)) {
    for (const match of round.matches) {
      const offset = side === "a" ? 0 : 1;
      out[match.key] =
        round.index === 0
          ? sheet.seats.find((seat) => seat.position === match.indexInRound * 2 + offset)!.player_id!
          : out[`r${round.index - 1}-m${match.indexInRound * 2 + offset}`];
    }
  }
  return out;
}

function liveRow(ref: string, sets: string): LiveDisplayState {
  return {
    publicRef: ref,
    phase: "in_play",
    sets: sets as LiveDisplayState["sets"],
    game: "15-30" as LiveDisplayState["game"],
    serving: null,
    flag: "live",
    provisionalWinner: null,
    occurredAt: null,
    receivedAt: "2026-08-11T12:30:00.000Z",
  };
}

function context(live: Record<string, LiveDisplayState>, brackets = [{ id: "b-a", league: "league-a", side: "a" as const }]): MyTennisContext {
  return {
    brackets: brackets.map((item) => ({
      bracketId: item.id,
      leagueId: item.league,
      tournamentRef: "syn-16",
      picks: picks(item.side),
    })),
    tournaments: { "syn-16": tournament },
    live,
  };
}

test("a trailing live pick ranks first and a settled win with no stake is absent", () => {
  const view = assembleMyTennis(
    context({ "syn16-r0-m2": liveRow("syn16-r0-m2", "4-6,1-0") }),
    DEFAULT_IMPORTANCE
  );
  assert.deepEqual(
    view.rows.slice(0, 2).map((row) => [row.matchRef, row.status, row.consequence.reasons[0].prio]),
    [
      ["syn16-r0-m2", "live", 2],
      ["syn16-r0-m1", "final", 2],
    ]
  );
  assert.deepEqual(view.rows[0].consequence.reasons[0].params, {
    state: "pressure",
    playerRef: "syn16-p05",
  });
  assert.equal(view.rows[0].consequence.importance, "important");
  assert.equal(view.rows[0].live?.sets, "4-6,1-0");
  assert.equal(view.rows[0].matters, true);
  assert.ok(!view.rows.some((row) => row.matchRef === "syn16-r0-m0"));
});

test("scheduled picks are rows below the floor, so the countdown can still find them", () => {
  const view = assembleMyTennis(context({}), DEFAULT_IMPORTANCE);
  const final = view.rows.find((row) => row.matchRef === "syn16-r1-m0");
  assert.ok(final);
  assert.equal(final.status, "scheduled");
  assert.equal(final.matters, false);
  assert.equal(final.consequence.ceilingDeltaIfLost, 2 + 4 + 8 + 8);
});

test("the triad agrees with gradeBracket and projects only a leading pick", () => {
  const trailing = assembleMyTennis(
    context({ "syn16-r0-m2": liveRow("syn16-r0-m2", "4-6,1-0") }),
    DEFAULT_IMPORTANCE
  ).triads[0];
  const official = Object.fromEntries(
    tournament.matches
      .filter((match) => match.winnerRef)
      .map((match) => [match.key, { winnerRef: match.winnerRef }])
  );
  assert.equal(trailing.banked, gradeBracket({ drawSize: 16, picks: picks("a"), official }).score);
  assert.deepEqual(
    { banked: trailing.banked, projected: trailing.projected, ceiling: trailing.ceiling },
    { banked: 1, projected: 1, ceiling: 39 }
  );

  const leading = assembleMyTennis(
    context({ "syn16-r0-m2": liveRow("syn16-r0-m2", "6-4,1-0") }),
    DEFAULT_IMPORTANCE
  ).triads[0];
  assert.equal(leading.projected, 2);
});

test("with two leagues on one draw, a match keeps the more pressing bracket", () => {
  const view = assembleMyTennis(
    context({}, [
      { id: "b-a", league: "league-a", side: "a" },
      { id: "b-b", league: "league-b", side: "b" },
    ]),
    DEFAULT_IMPORTANCE
  );
  assert.deepEqual(view.triads.map((triad) => triad.leagueId), ["league-a", "league-b"]);
  // Only the right-side bracket picked p02, who lost r0-m0; the left-side
  // bracket has no stake left there. r0-m1 (earlier start) ranks first.
  assert.deepEqual(view.rows.slice(0, 2).map((row) => [row.matchRef, row.leagueId]), [
    ["syn16-r0-m1", "league-a"],
    ["syn16-r0-m0", "league-b"],
  ]);
  assert.deepEqual(view.rows[1].consequence.reasons[0], {
    prio: 2,
    kind: "forward",
    params: { state: "eliminated", playerRef: "syn16-p02" },
  });
  assert.equal(new Set(view.rows.map((row) => row.matchRef)).size, view.rows.length);
});

test("server thresholds come from config and fall back to the defaults", () => {
  assert.deepEqual(parseImportanceConfig({ criticalAtOrBelow: 1, importantAtOrBelow: 3 }), {
    criticalAtOrBelow: 1,
    importantAtOrBelow: 3,
  });
  assert.deepEqual(parseImportanceConfig({ criticalAtOrBelow: "0" }), DEFAULT_IMPORTANCE);
  assert.deepEqual(parseImportanceConfig({ criticalAtOrBelow: 0, importantAtOrBelow: 9 }), DEFAULT_IMPORTANCE);
  assert.deepEqual(parseImportanceConfig(null), DEFAULT_IMPORTANCE);

  const strict = assembleMyTennis(context({ "syn16-r0-m2": liveRow("syn16-r0-m2", "4-6,1-0") }), {
    criticalAtOrBelow: 0,
    importantAtOrBelow: 1,
  });
  assert.equal(strict.rows[0].consequence.importance, "normal");
});
