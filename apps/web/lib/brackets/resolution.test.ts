import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRoundStructure } from "../../../../packages/core/src/bracket.ts";
import {
  matchSheetPresentation,
  matchSheetState,
  officialWinnerRef,
  pickHighlight,
  presentNodeSchedule,
} from "./resolution.ts";

/**
 * Quarter-final column: one settled result, one still to be played.
 * The pair is the quarter-final round of a 16-draw. Names are not inputs.
 */
test("quarter-final played and upcoming sheet states stay distinct", () => {
  const quarter = buildRoundStructure(16).find(
    (round) => round.playersRemaining === 8
  );
  assert.ok(quarter);
  assert.equal(quarter.label.match, "Quarter-final");
  const [playedMatch, upcomingMatch] = quarter.matches;
  assert.ok(playedMatch && upcomingMatch);
  assert.notEqual(playedMatch.key, upcomingMatch.key);

  const rows = {
    [playedMatch.key]: {
      winnerRef: "seat-winner",
      voided: false,
      officialScore: "7-6(5) 6-4",
      scheduledAt: "2026-08-12T15:00:00.000Z",
    },
    [upcomingMatch.key]: {
      winnerRef: null,
      voided: false,
      officialScore: "7-6(5) 6-4",
      scheduledAt: "2026-08-12T18:00:00.000Z",
    },
  };

  const played = matchSheetPresentation(rows[playedMatch.key]);
  const upcoming = matchSheetPresentation(rows[upcomingMatch.key]);

  assert.equal(played.state, "official");
  assert.equal(played.labelKey, "result.official");
  assert.equal(played.showScore, "7-6(5) 6-4");
  assert.equal(upcoming.state, "scheduled");
  assert.equal(upcoming.labelKey, "match.scheduled");
  assert.equal(upcoming.showScore, null);
  assert.notEqual(played.state, upcoming.state);
  assert.notEqual(played.labelKey, upcoming.labelKey);
  assert.equal(
    officialWinnerRef(
      { winnerRef: "side-a", voided: false },
      ["side-a", "side-b"]
    ),
    "side-a"
  );
  assert.equal(
    officialWinnerRef(
      { winnerRef: null, voided: false },
      ["side-c", "side-d"]
    ),
    null
  );
});

test("the sheet state stays the two implemented values", () => {
  const samples = [
    matchSheetState(null),
    matchSheetState({ winnerRef: null, voided: false }),
    matchSheetState({ winnerRef: "p-0", voided: false }),
    matchSheetState({ voided: true }),
  ];
  assert.deepEqual(new Set(samples), new Set(["official", "scheduled"]));
});

test("score text and start time do not choose the sheet state", () => {
  const scoreOnly = matchSheetPresentation({
    winnerRef: null,
    voided: false,
    officialScore: "6-0 6-0",
  });
  assert.equal(scoreOnly.state, "scheduled");
  assert.equal(scoreOnly.showScore, null);

  const settledWithoutScore = matchSheetPresentation({
    winnerRef: "seat-winner",
    voided: false,
    officialScore: "   ",
  });
  assert.equal(settledWithoutScore.state, "official");
  assert.equal(settledWithoutScore.showScore, null);

  const voided = matchSheetPresentation({
    winnerRef: null,
    voided: true,
    officialScore: null,
  });
  assert.equal(voided.state, "official");
  assert.equal(voided.showScore, null);
});

test("a scheduled node keeps stored time, session, and court, and TBA when none exist", () => {
  const open = presentNodeSchedule(null);
  assert.equal(open.timeTba, true);
  assert.equal(open.scheduledAt, null);
  assert.equal(open.hasTime, false);
  assert.equal(open.session, null);
  assert.equal(open.court, null);

  const timed = presentNodeSchedule({
    scheduled_at: "2026-08-10T14:00:00.000Z",
    has_time: true,
    session: "day",
    court: " Court 1 ",
  });
  assert.equal(timed.timeTba, false);
  assert.equal(timed.scheduledAt, "2026-08-10T14:00:00.000Z");
  assert.equal(timed.hasTime, true);
  assert.equal(timed.session, "day");
  assert.equal(timed.court, "Court 1");

  const unnamed = presentNodeSchedule({
    scheduled_at: "2026-08-10T02:00:00.000Z",
    has_time: true,
    session: "evening",
    court: "   ",
  });
  assert.equal(unnamed.session, null);
  assert.equal(unnamed.court, null);
});

test("the winner mark is a stored side, and a pick highlight follows the official result", () => {
  assert.equal(officialWinnerRef({ winnerRef: "p-0", voided: false }, ["p-0", "p-1"]), "p-0");
  assert.equal(officialWinnerRef({ winnerRef: "p-9", voided: false }, ["p-0", "p-1"]), null);
  assert.equal(officialWinnerRef({ winnerRef: "p-0", voided: true }, ["p-0", "p-1"]), null);

  assert.equal(pickHighlight(false, false), null);
  assert.equal(pickHighlight(true, false), "open");
  assert.equal(pickHighlight(true, true), "settled");
});
