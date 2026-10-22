import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarStatus,
  calendarStatusMessageKey,
  formatCountdown,
  isComplete,
  isEntryLocked,
  isEntryOpen,
  isInPlay,
  isOnCourt,
} from "./status.ts";

const inPlayEvent = {
  hasDraw: true,
  starts_on: "2026-08-03",
  lock_at: "2026-08-02T15:00:00.000Z",
};

const pendingEvent = {
  hasDraw: false,
  starts_on: "2026-08-03",
  lock_at: "2026-08-02T15:00:00.000Z",
};

const upcomingNoDraw = {
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

test("a locked published draw is on court; the same week without a draw is pending", () => {
  assert.equal(calendarStatus(inPlayEvent, rehearsal), "live");
  assert.equal(calendarStatus(pendingEvent, rehearsal), "drawPending");
  assert.equal(calendarStatusMessageKey("live"), "calendar.onCourt");
  assert.equal(isInPlay(inPlayEvent, rehearsal), true);
  assert.equal(isOnCourt(inPlayEvent, rehearsal), true);
  assert.equal(isOnCourt(pendingEvent, rehearsal), false);
  assert.equal(isEntryOpen(inPlayEvent, rehearsal), false);
  assert.equal(isEntryOpen(pendingEvent, rehearsal), false);
});

test("an unpublished future event is draw-pending before it starts", () => {
  assert.equal(calendarStatus(upcomingNoDraw, rehearsal), "drawPending");
});

test("an unlocked draw before start is Open", () => {
  const unlocked = {
    hasDraw: true,
    starts_on: "2026-08-13",
    lock_at: "2026-08-12T15:00:00.000Z",
  };
  const beforeLock = new Date("2026-08-11T12:00:00.000Z");
  assert.equal(calendarStatus(unlocked, beforeLock), "open");
  assert.equal(isEntryOpen(unlocked, beforeLock), true);
  assert.equal(isOnCourt(unlocked, beforeLock), false);
});

test("a started draw with no lock_at is not entry-open", () => {
  const noLock = {
    hasDraw: true,
    starts_on: "2026-08-10",
    lock_at: null as string | null,
  };
  assert.equal(isEntryOpen(noLock, rehearsal), false);
  assert.equal(isOnCourt(noLock, rehearsal), false);
  assert.equal(calendarStatus(noLock, rehearsal), "live");
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

test("ends_on ends the in-play window before the 14-day fallback", () => {
  const hamburg = {
    hasDraw: true,
    starts_on: "2026-08-10",
    ends_on: "2026-08-16",
    lock_at: "2026-08-10T15:33:00.000Z",
  };
  const midWeek = new Date("2026-08-14T12:00:00.000Z");
  const afterEnd = new Date("2026-08-21T12:00:00.000Z");
  assert.equal(isInPlay(hamburg, midWeek), true);
  assert.equal(isOnCourt(hamburg, midWeek), true);
  assert.equal(isComplete(hamburg, afterEnd), true);
  assert.equal(isOnCourt(hamburg, afterEnd), false);
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
