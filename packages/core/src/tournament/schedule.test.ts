import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isScheduleEditable,
  isScheduleLocked,
  scheduleGroup,
  scheduleStatus,
} from "./schedule.ts";

const now = new Date("2026-11-01T12:00:00.000Z");
const before = "2026-11-02T10:00:00.000Z";
const after = "2026-10-31T10:00:00.000Z";

test("no draw and nothing announced is upcoming", () => {
  const s = scheduleStatus({ hasDraw: false, drawAnnounced: false, lockAt: null, complete: false, now });
  assert.equal(s, "upcoming");
  assert.equal(scheduleGroup(s), "upcoming");
  assert.equal(isScheduleEditable(s), true);
});

test("a lock time without an official draw is draw pending and still editable", () => {
  const s = scheduleStatus({ hasDraw: false, drawAnnounced: true, lockAt: after, complete: false, now });
  assert.equal(s, "drawPending");
  assert.equal(isScheduleEditable(s), true);
});

test("an official draw before lock is open", () => {
  const s = scheduleStatus({ hasDraw: true, drawAnnounced: true, lockAt: before, complete: false, now });
  assert.equal(s, "open");
  assert.equal(isScheduleEditable(s), true);
});

test("an official draw past lock is in play and not editable", () => {
  const s = scheduleStatus({ hasDraw: true, drawAnnounced: true, lockAt: after, complete: false, now });
  assert.equal(s, "inPlay");
  assert.equal(scheduleGroup(s), "inPlay");
  assert.equal(isScheduleEditable(s), false);
});

test("a commissioner lock locks before lock_at, like picks_are_locked", () => {
  const input = {
    hasDraw: true,
    drawAnnounced: true,
    lockAt: before,
    leagueLockedAt: after,
    complete: false,
    now,
  };
  assert.equal(isScheduleLocked(input), true);
  assert.equal(scheduleStatus(input), "inPlay");
});

test("a complete event is completed", () => {
  const s = scheduleStatus({ hasDraw: true, drawAnnounced: true, lockAt: after, complete: true, now });
  assert.equal(s, "completed");
  assert.equal(scheduleGroup(s), "completed");
  assert.equal(isScheduleEditable(s), false);
});
