import assert from "node:assert/strict";
import { test } from "node:test";
import { liveMark, ranksMayChange, refreshDelay, RERANK_MIN_GAP_MS } from "./live-rerank.ts";

test("a tick that keeps the same leader does not re-rank", () => {
  const before = liveMark(true, "3-6,2-1");
  assert.equal(ranksMayChange(before, liveMark(true, "3-6,3-1")), false);
  assert.equal(ranksMayChange(before, liveMark(true, "3-6,2-1")), false);
});

test("a leader change, a match going live and a match leaving the live layer re-rank", () => {
  assert.equal(ranksMayChange(liveMark(true, "3-6,2-1"), liveMark(true, "6-3,2-1")), true);
  assert.equal(ranksMayChange(liveMark(false, null), liveMark(true, "0-0")), true);
  assert.equal(ranksMayChange(liveMark(true, "6-3"), liveMark(false, null)), true);
  // Level to leading is a change; an unknown row counts as not live.
  assert.equal(ranksMayChange(liveMark(true, "6-3,3-6"), liveMark(true, "6-3,3-6,1-0")), true);
  assert.equal(ranksMayChange(undefined, liveMark(true, "1-0")), true);
});

test("the leader is read the same way as the server ranks: sets, then games", () => {
  assert.deepEqual(liveMark(true, "6-3,2-4"), { live: true, lead: "a" });
  assert.deepEqual(liveMark(true, "6-3,4-6,2-4"), { live: true, lead: "b" });
  assert.deepEqual(liveMark(true, "garbage"), { live: true, lead: null });
  assert.deepEqual(liveMark(false, "6-3"), { live: false, lead: null });
});

test("refreshes are spaced at least the minimum gap apart", () => {
  assert.equal(refreshDelay(null, 1_000), 0);
  assert.equal(refreshDelay(1_000, 2_000), RERANK_MIN_GAP_MS - 1_000);
  assert.equal(refreshDelay(1_000, 1_000 + RERANK_MIN_GAP_MS + 1), 0);
});
