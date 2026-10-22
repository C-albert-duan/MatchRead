import assert from "node:assert/strict";
import { test } from "node:test";
import { matchSheetPresentation } from "../brackets/resolution.ts";
import { browserLiveDelay, LIVE_BROWSER_STALE_MS } from "./freshness.ts";
import { isLiveStale, LIVE_STALE_MS } from "./patch.ts";
import { liveScoreFields } from "./score.ts";
import {
  armRealtimeRecovery,
  isRealtimeLoss,
  LIVE_POLL_MS,
  LIVE_RETRY_MS,
  nextRealtimeRecovery,
} from "./disconnect.ts";

test("channel errors, timeouts, and connection loss are retries", () => {
  assert.equal(isRealtimeLoss("CHANNEL_ERROR"), true);
  assert.equal(isRealtimeLoss("TIMED_OUT"), true);
  assert.equal(isRealtimeLoss("CLOSED"), true);
  assert.equal(isRealtimeLoss("offline"), true);
  assert.equal(isRealtimeLoss("SUBSCRIBED"), false);
});

test("recovery retries with backoff and then polls about every 30 seconds", () => {
  assert.deepEqual(
    LIVE_RETRY_MS.map((_, attempt) => nextRealtimeRecovery(attempt)),
    [
      { waitMs: 1_000, mode: "retry" },
      { waitMs: 2_000, mode: "retry" },
      { waitMs: 4_000, mode: "retry" },
      { waitMs: 8_000, mode: "retry" },
      { waitMs: 15_000, mode: "retry" },
    ]
  );
  assert.deepEqual(nextRealtimeRecovery(LIVE_RETRY_MS.length), { waitMs: LIVE_POLL_MS, mode: "poll" });
  assert.equal(nextRealtimeRecovery(LIVE_RETRY_MS.length + 3).waitMs, 30_000);
});

test("a lost channel backs off, then polls, and the badge leaves Live", () => {
  let failures = 0;
  let waiting = false;
  const steps = [];
  function lose() {
    const armed = armRealtimeRecovery({ failures, waiting });
    if (!armed.arm) return armed;
    failures = armed.failures;
    waiting = true;
    steps.push(armed.step);
    waiting = false;
    return armed;
  }

  assert.equal(lose().arm, true);
  assert.equal(armRealtimeRecovery({ failures, waiting: true }).arm, false);
  for (let n = 1; n < LIVE_RETRY_MS.length; n += 1) lose();
  assert.deepEqual(
    steps.map((step) => step.waitMs),
    [1_000, 2_000, 4_000, 8_000, 15_000]
  );
  assert.equal(steps.every((step) => step.mode === "retry"), true);

  const polled = lose();
  assert.equal(polled.arm, true);
  if (polled.arm) {
    assert.equal(polled.step.mode, "poll");
    assert.equal(polled.step.waitMs, LIVE_POLL_MS);
  }
  failures = 0;
  const restored = armRealtimeRecovery({ failures, waiting: false });
  assert.equal(restored.arm, true);
  if (restored.arm) assert.deepEqual(restored.step, { waitMs: 1_000, mode: "retry" });

  const observed = "2026-10-10T15:00:00.000Z";
  const at = Date.parse(observed);
  const quiet = liveScoreFields(
    matchSheetPresentation({
      live: {
        phase: "in_play",
        scoreText: "6-4",
        pointsText: "30-0",
        servingSide: "a",
        stale: isLiveStale(observed, at + LIVE_STALE_MS + 1),
      },
    }),
    { live: "Live", stale: "Stale", provisional: "Provisional", serving: "Serving" }
  );
  assert.equal(quiet?.badge, "Stale");
  assert.equal(quiet?.score, "6-4 · 30-0");
  assert.equal(
    browserLiveDelay({
      lastFreshAt: at,
      now: at + LIVE_BROWSER_STALE_MS + 1,
      expectingPlay: true,
    }).delayed,
    true
  );
});

test("a quiet score is stale once freshness passes the threshold", () => {
  const observed = "2026-10-10T15:00:00.000Z";
  const at = Date.parse(observed);
  assert.equal(isLiveStale(observed, at + LIVE_STALE_MS), false);
  assert.equal(isLiveStale(observed, at + LIVE_STALE_MS + 1), true);
});
