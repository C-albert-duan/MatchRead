import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RECONNECT_BACKOFF_MS,
  STALE_AFTER_MS,
  isProviderStale,
  nextReconnectAttempt,
  reconnectDelayMs,
} from "./reconnect.js";

describe("reconnect delay", () => {
  it("follows 1, 2, 4, 8, 15, 30, and 60 seconds", () => {
    assert.deepEqual(RECONNECT_BACKOFF_MS, [1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 60_000]);
    for (const [attempt, base] of RECONNECT_BACKOFF_MS.entries()) {
      assert.equal(reconnectDelayMs(attempt, () => 0.5), base);
      assert.equal(reconnectDelayMs(attempt, () => 0), Math.round(base * 0.8));
      assert.equal(reconnectDelayMs(attempt, () => 1), Math.round(base * 1.2));
    }
  });

  it("stays on 60 seconds and never returns a tight wait", () => {
    assert.equal(reconnectDelayMs(99, () => 0.5), 60_000);
    assert.ok(reconnectDelayMs(0, () => 0) >= 800);
  });

  it("resets after a stable read and steps after a failure", () => {
    assert.equal(nextReconnectAttempt(4, true), 0);
    assert.equal(nextReconnectAttempt(0, false), 1);
    assert.equal(nextReconnectAttempt(6, false), 6);
  });

  it("marks provider freshness after 90 seconds", () => {
    assert.equal(STALE_AFTER_MS, 90_000);
    const at = 1_000_000;
    assert.equal(isProviderStale(null, at), true);
    assert.equal(isProviderStale(at, at + 90_000), false);
    assert.equal(isProviderStale(at, at + 90_001), true);
  });
});
