import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarStatus,
  calendarStatusMessageKey,
  formatCountdown,
  isEntryLocked,
  isEntryOpen,
  isInPlay,
  isOnCourt,
} from "./status.ts";

const montreal = {
  hasDraw: true,
  starts_on: "2026-08-03",
  lock_at: "2026-08-02T15:00:00.000Z",
};

const torontoNoDraw = {
  hasDraw: false,
  starts_on: "2026-08-03",
  lock_at: "2026-08-02T15:00:00.000Z",
};

const usOpen = {
  hasDraw: false,
  starts_on: "2026-08-30",
  lock_at: "2026-08-29T15:00:00.000Z",
};

const rehearsal = new Date("2026-08-12T12:00:00.000Z");

test("a past lock_at without a draw is not an entry lock", () => {
  assert.equal(
    isEntryLocked(
      {
        hasDraw: false,
        lock_at: "2026-08-11T17:00:00.000Z",
        admin_locked_at: null,
      },
      rehearsal
    ),
    false
  );
  assert.equal(
    isEntryLocked(
      {
        hasDraw: true,
        lock_at: "2026-08-11T17:00:00.000Z",
        admin_locked_at: null,
      },
      rehearsal
    ),
    true
  );
});

test("Montreal with a locked draw is on court; Toronto without a draw is not", () => {
  assert.equal(calendarStatus(montreal, rehearsal), "live");
  assert.equal(calendarStatus(torontoNoDraw, rehearsal), "drawPending");
  assert.equal(calendarStatusMessageKey("live"), "calendar.onCourt");
  assert.equal(isInPlay(montreal, rehearsal), true);
  assert.equal(isOnCourt(montreal, rehearsal), true);
  assert.equal(isOnCourt(torontoNoDraw, rehearsal), false);
  assert.equal(isEntryOpen(montreal, rehearsal), false);
  assert.equal(isEntryOpen(torontoNoDraw, rehearsal), false);
});

test("US Open with no draw is draw-pending before it starts", () => {
  assert.equal(calendarStatus(usOpen, rehearsal), "drawPending");
});

test("an unlocked draw before start is Open", () => {
  const cin = {
    hasDraw: true,
    starts_on: "2026-08-13",
    lock_at: "2026-08-12T15:00:00.000Z",
  };
  const beforeLock = new Date("2026-08-11T12:00:00.000Z");
  assert.equal(calendarStatus(cin, beforeLock), "open");
  assert.equal(isEntryOpen(cin, beforeLock), true);
  assert.equal(isOnCourt(cin, beforeLock), false);
});

test("a started draw with no lock_at is not entry-open", () => {
  const astana = {
    hasDraw: true,
    starts_on: "2026-08-10",
    lock_at: null as string | null,
  };
  assert.equal(isEntryOpen(astana, rehearsal), false);
  assert.equal(isOnCourt(astana, rehearsal), false);
  assert.equal(calendarStatus(astana, rehearsal), "live");
});

test("a locked draw is not on court before the week starts", () => {
  const early = {
    hasDraw: true,
    starts_on: "2026-08-20",
    lock_at: "2026-08-11T12:00:00.000Z",
  };
  assert.equal(isOnCourt(early, rehearsal), false);
  assert.equal(isEntryOpen(early, rehearsal), false);
  assert.equal(calendarStatus(early, rehearsal), "locked");
});

test("a finished draw is not entry-open even without lock_at", () => {
  const done = {
    hasDraw: true,
    starts_on: "2026-07-20",
    lock_at: null as string | null,
  };
  assert.equal(calendarStatus(done, rehearsal), "complete");
  assert.equal(isEntryOpen(done, rehearsal), false);
  assert.equal(isOnCourt(done, rehearsal), false);
});

test("countdown is locale-aware and silent after the instant", () => {
  const inEn = formatCountdown("2026-08-30T12:00:00.000Z", "en", rehearsal);
  assert.ok(inEn && /day/i.test(inEn));
  const inJa = formatCountdown("2026-08-30T12:00:00.000Z", "ja", rehearsal);
  assert.ok(inJa && inJa !== inEn);
  assert.equal(
    formatCountdown("2026-08-01T12:00:00.000Z", "en", rehearsal),
    null
  );
});
