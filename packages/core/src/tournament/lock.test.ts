import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertLockIsSound,
  isLockUnsound,
  LockSoundnessError,
} from "./lock";

test("eligible tournament without zone fails", () => {
  assert.throws(
    () =>
      assertLockIsSound(
        { lock_at: "2026-08-30T15:00:00.000Z", venue_tz: null, bracket_eligible: true },
        null
      ),
    (e: unknown) => e instanceof LockSoundnessError && e.code === "missing_zone"
  );
});

test("lock after first timed ball fails (Monday-anchored US Open)", () => {
  assert.throws(
    () =>
      assertLockIsSound(
        {
          lock_at: "2026-08-31T15:00:00.000Z",
          venue_tz: "America/New_York",
          main_draw_starts_on: "2026-08-31",
          bracket_eligible: true,
        },
        { startsAt: "2026-08-30T15:00:00.000Z", hasTime: true }
      ),
    (e: unknown) =>
      e instanceof LockSoundnessError && e.code === "lock_after_first_ball"
  );
});

test("lock at or before first ball passes", () => {
  assert.doesNotThrow(() =>
    assertLockIsSound(
      {
        lock_at: "2026-08-30T15:00:00.000Z",
        venue_tz: "America/New_York",
        main_draw_starts_on: "2026-08-30",
        bracket_eligible: true,
      },
      { startsAt: "2026-08-30T15:00:00.000Z", hasTime: true }
    )
  );
});

test("isLockUnsound mirrors assert", () => {
  assert.equal(
    isLockUnsound(
      {
        lock_at: "2026-08-31T15:00:00.000Z",
        venue_tz: "America/New_York",
        bracket_eligible: true,
      },
      { startsAt: "2026-08-30T15:00:00.000Z", hasTime: true }
    ),
    true
  );
});
