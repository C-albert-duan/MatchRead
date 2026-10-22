import assert from "node:assert/strict";
import { test } from "node:test";
import { matchSheetPresentation } from "../brackets/resolution.ts";
import { knownServingSide, liveScoreFields } from "./score.ts";

const labels = { live: "Live", stale: "Stale", provisional: "Provisional", serving: "Serving" };

test("a live cell shows the badge, score, and serve indicator", () => {
  const fields = liveScoreFields(
    matchSheetPresentation({
      live: { phase: "in_play", scoreText: "6-4", pointsText: "30-0", servingSide: "a", stale: false },
    }),
    labels
  );
  assert.deepEqual(fields, { badge: "Live", score: "6-4 · 30-0", serving: "Serving", note: null });
});

test("a quiet live score stays, and the badge is no longer Live", () => {
  const fields = liveScoreFields(
    matchSheetPresentation({
      live: { phase: "in_play", scoreText: "6-4", pointsText: "30-0", servingSide: "b", stale: true },
    }),
    labels
  );
  assert.deepEqual(fields, { badge: "Stale", score: "6-4 · 30-0", serving: "Serving", note: null });
});

test("a provisional finish shows the set score and a calm note", () => {
  const fields = liveScoreFields(
    matchSheetPresentation({
      live: {
        phase: "provisional_final",
        scoreText: "6-4,6-2",
        pointsText: "40-0",
        servingSide: "a",
      },
    }),
    { ...labels, provisional: "Awaiting official result" }
  );
  assert.deepEqual(fields, {
    badge: null,
    score: "6-4 6-2",
    serving: null,
    note: "Awaiting official result",
  });
});

test("a null server shows no indicator", () => {
  const fields = liveScoreFields(
    matchSheetPresentation({
      live: {
        phase: "in_play",
        scoreText: "6-4,1-0",
        pointsText: "40-0",
        servingSide: null,
        stale: false,
      },
    }),
    labels
  );
  assert.equal(fields?.serving, null);
  assert.equal(fields?.score, "6-4,1-0 · 40-0");
  assert.equal(knownServingSide(null), null);
  assert.equal(knownServingSide(undefined), null);
  assert.equal(knownServingSide(""), null);
  assert.equal(knownServingSide("1"), null);
  assert.equal(knownServingSide("a"), "a");
});

test("a settled sheet is not a live score", () => {
  const fields = liveScoreFields(
    matchSheetPresentation({ winnerRef: "p-1", officialScore: "6-3 6-2" }),
    labels
  );
  assert.equal(fields, null);
});
