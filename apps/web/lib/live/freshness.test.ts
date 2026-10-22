import assert from "node:assert/strict";
import { test } from "node:test";
import { t, tf } from "@matchread/i18n";
import { browserLiveDelay, LIVE_BROWSER_STALE_MS } from "./freshness.ts";

const at = Date.parse("2026-10-10T18:00:00.000Z");

test("play with no fresh live information for about 60 seconds is delayed", () => {
  assert.equal(LIVE_BROWSER_STALE_MS, 60_000);
  assert.deepEqual(
    browserLiveDelay({ lastFreshAt: at, now: at + LIVE_BROWSER_STALE_MS, expectingPlay: true }),
    { delayed: false, minutes: null }
  );
  assert.deepEqual(
    browserLiveDelay({
      lastFreshAt: at,
      now: at + LIVE_BROWSER_STALE_MS + 1,
      expectingPlay: true,
    }),
    { delayed: true, minutes: 1 }
  );
  assert.deepEqual(
    browserLiveDelay({ lastFreshAt: at, now: at + 120_000, expectingPlay: true }),
    { delayed: true, minutes: 2 }
  );
});

test("a delayed banner waits for expected play and a successful update", () => {
  assert.deepEqual(
    browserLiveDelay({ lastFreshAt: at, now: at + 180_000, expectingPlay: false }),
    { delayed: false, minutes: null }
  );
  assert.deepEqual(
    browserLiveDelay({ lastFreshAt: null, now: at + 180_000, expectingPlay: true }),
    { delayed: false, minutes: null }
  );
});

test("delay copy keeps the last update age subdued", () => {
  assert.equal(t("en", "live.delayed"), "Live updates delayed");
  assert.equal(tf("en", "live.lastUpdated", { n: 1 }), "Last updated 1m ago");
});
