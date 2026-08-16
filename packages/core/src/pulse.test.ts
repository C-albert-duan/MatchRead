import assert from "node:assert/strict";
import { test } from "node:test";
import { isPersonalDailyCheck } from "./pulse.ts";

test("Daily Check stays off until this member submitted and has a standing", () => {
  assert.equal(
    isPersonalDailyCheck({ youSubmitted: false, kind: "live" }),
    false
  );
  assert.equal(
    isPersonalDailyCheck({ youSubmitted: true, kind: "draw_pending" }),
    false
  );
  assert.equal(
    isPersonalDailyCheck({ youSubmitted: true, kind: "awaiting_entries" }),
    false
  );
  assert.equal(
    isPersonalDailyCheck({ youSubmitted: true, kind: "no_data" }),
    false
  );
});

test("submitted + settled kinds are personal facts", () => {
  for (const kind of [
    "live",
    "quiet",
    "champion_out",
    "final",
    "picks_voided",
  ] as const) {
    assert.equal(isPersonalDailyCheck({ youSubmitted: true, kind }), true);
  }
});
