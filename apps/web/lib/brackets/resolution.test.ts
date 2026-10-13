import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRoundStructure } from "../../../../packages/core/src/bracket.ts";
import { matchSheetPresentation } from "./resolution.ts";

/**
 * Quarter-final column: one settled result, one still to be played.
 * No named historical fixture is in the repo, so the pair is the
 * quarter-final round of a 16-draw. Names are not inputs.
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
