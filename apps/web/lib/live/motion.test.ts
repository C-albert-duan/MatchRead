import assert from "node:assert/strict";
import { test } from "node:test";
import { liveIndicatorMotion } from "./motion.ts";

test("a hidden tab stops the live indicator", () => {
  assert.equal(liveIndicatorMotion({ hidden: true, live: true, reducedMotion: false }), "stop");
});

test("a visible live match may animate", () => {
  assert.equal(liveIndicatorMotion({ hidden: false, live: true, reducedMotion: false }), "run");
});

test("a visible match that is no longer live stays still", () => {
  assert.equal(liveIndicatorMotion({ hidden: false, live: false, reducedMotion: false }), "stop");
});

test("reduced motion stops the indicator even while the match is live", () => {
  assert.equal(liveIndicatorMotion({ hidden: false, live: true, reducedMotion: true }), "stop");
});
