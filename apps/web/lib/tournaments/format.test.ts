import assert from "node:assert/strict";
import { test } from "node:test";
import { matchScheduleCaption, matchStartCaption } from "./format.ts";

test("a missing start is TBA and a date-only row has no clock", () => {
  const tba = "Time to be announced";
  assert.equal(matchStartCaption(null, "UTC", "en", tba, "TBC"), tba);
  assert.equal(
    matchStartCaption(
      { scheduled_at: null, has_time: false },
      null,
      "en",
      tba,
      "TBC"
    ),
    tba
  );
  const dateOnly = matchStartCaption(
    { scheduled_at: "2026-08-11T12:00:00.000Z", has_time: false },
    null,
    "en",
    tba,
    "TBC"
  );
  assert.equal(dateOnly, `11 AUG · ${tba}`);
  assert.ok(!dateOnly?.includes("12:00"));
  const midnight = matchStartCaption(
    { scheduled_at: "2026-08-11T00:00:00.000Z", has_time: true },
    "UTC",
    "en",
    tba,
    "TBC"
  );
  assert.equal(midnight, `11 AUG · ${tba}`);
  assert.ok(!midnight?.includes("00:00"));
});

test("a timed start stays hidden until the viewer zone is known", () => {
  assert.equal(
    matchStartCaption(
      { scheduled_at: "2026-08-10T14:00:00.000Z", has_time: true },
      null,
      "en",
      "TBA",
      "TBC"
    ),
    null
  );
  const timed = matchStartCaption(
    { scheduled_at: "2026-08-10T14:00:00.000Z", has_time: true },
    "UTC",
    "en",
    "TBA",
    "TBC"
  );
  assert.match(timed ?? "", /10 AUG/);
  assert.match(timed ?? "", /14:00|2:00/);
});

test("a scheduled node shows the shared clock, then session and court when present", () => {
  const labels = {
    tba: "Time to be announced",
    tbc: "TBC",
    day: "Day",
    night: "Night",
  };
  const row = {
    scheduled_at: "2026-08-10T23:00:00.000Z",
    has_time: true,
    session: "night" as const,
    court: "Centre Court",
  };
  const lines = matchScheduleCaption(row, "America/New_York", "en", labels);
  assert.equal(
    lines.when,
    matchStartCaption(row, "America/New_York", "en", labels.tba, labels.tbc)
  );
  assert.equal(lines.place, "Night · Centre Court");
  assert.equal(
    matchScheduleCaption(
      { scheduled_at: row.scheduled_at, has_time: true, session: null, court: null },
      "America/New_York",
      "en",
      labels
    ).place,
    null
  );
  const epoch = matchScheduleCaption(
    {
      scheduled_at: "1970-01-01T00:00:00.000Z",
      has_time: true,
      session: null,
      court: null,
    },
    "UTC",
    "en",
    labels
  );
  assert.equal(epoch.when, labels.tba);
  assert.equal(epoch.place, null);
  assert.equal(epoch.when?.includes("1970"), false);
  assert.equal(epoch.when?.includes("00:00"), false);
});
