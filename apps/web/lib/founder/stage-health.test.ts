import assert from "node:assert/strict";
import { test } from "node:test";
import { founderStageHealth, stageRatesFrom } from "./stage-health.ts";

test("bigint rate columns that arrive as strings are read as numbers", () => {
  assert.deepEqual(stageRatesFrom({ events: "12", users: "4", max_per_user_hour: "3" }), {
    events: 12,
    users: 4,
    maxPerUserHour: 3,
  });
  assert.equal(stageRatesFrom(null), null);
});

test("more than two Stage changes in one user-hour is the event mark", () => {
  const calm = founderStageHealth({ rates: { events: 5, users: 3, maxPerUserHour: 2 }, winnerConflicts: 0 });
  assert.equal(calm.stage?.level, "ok");
  const busy = founderStageHealth({ rates: { events: 9, users: 2, maxPerUserHour: 3 }, winnerConflicts: 0 });
  assert.equal(busy.stage?.level, "event");
});

test("any winner conflict is the error mark; no rates is no tile", () => {
  const health = founderStageHealth({ rates: null, winnerConflicts: 1 });
  assert.equal(health.stage, null);
  assert.deepEqual(health.winnerConflicts, { count: 1, level: "error" });
  assert.equal(founderStageHealth({ rates: null, winnerConflicts: 0 }).winnerConflicts.level, "ok");
  assert.deepEqual(founderStageHealth({ rates: null, winnerConflicts: null }).winnerConflicts, {
    count: null,
    level: "ok",
  });
});
