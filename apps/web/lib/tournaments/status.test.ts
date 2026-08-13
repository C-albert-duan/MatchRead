import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarStatus,
  formatCountdown,
  isEntryOpen,
  isInPlay,
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

test("Montreal and Toronto are live on 12 Aug, not Open", () => {
  assert.equal(calendarStatus(montreal, rehearsal), "live");
  assert.equal(calendarStatus(torontoNoDraw, rehearsal), "live");
  assert.equal(isInPlay(montreal, rehearsal), true);
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
