import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarDayInZone,
  captionTimeZone,
  formatLockWhen,
  formatMatchWhen,
  viewerTimeZone,
} from "./format.ts";

const labels = { today: "Today", tomorrow: "Tomorrow" };

test("formats lock in viewer America/Chicago, not UTC wall clock", () => {
  // 15:00 UTC → 10:00 AM CDT (UTC-4 in August)
  const lockAt = "2026-08-18T15:00:00.000Z";
  const now = new Date("2026-08-18T16:00:00.000Z"); // afternoon UTC = late morning Chicago
  const chicago = formatLockWhen(
    lockAt,
    "America/Chicago",
    "en",
    labels,
    now
  );
  const utc = formatLockWhen(lockAt, "UTC", "en", labels, now);
  assert.match(chicago, /Today/);
  assert.match(utc, /Today/);
  assert.notEqual(chicago, utc);
  assert.match(chicago, /10:00/);
  assert.match(utc, /15:00|3:00/);
});

test("Today / Tomorrow follow the viewer zone calendar day", () => {
  // 02:00 UTC 18 Aug is still 17 Aug evening in Chicago
  const lockAt = "2026-08-18T15:00:00.000Z";
  const now = new Date("2026-08-18T02:00:00.000Z");
  const chicago = formatLockWhen(
    lockAt,
    "America/Chicago",
    "en",
    labels,
    now
  );
  const utc = formatLockWhen(lockAt, "UTC", "en", labels, now);
  assert.match(chicago, /Tomorrow/);
  assert.match(utc, /Today/);
});

test("a US evening instant is the previous calendar day in New York", () => {
  const instant = "2026-08-12T02:30:00.000Z";
  assert.equal(calendarDayInZone(instant, "UTC"), "2026-08-12");
  assert.equal(calendarDayInZone(instant, "America/New_York"), "2026-08-11");
  const row = { scheduled_at: instant, has_time: true as const };
  assert.match(formatMatchWhen(row, "UTC", "en", "TBC"), /12 AUG/);
  assert.match(formatMatchWhen(row, "America/New_York", "en", "TBC"), /11 AUG/);
});

test("a date-only midnight UTC instant keeps that civil date in every viewer zone", () => {
  const row = { scheduled_at: "2026-09-01T00:00:00.000Z", has_time: false as const };
  for (const zone of ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"]) {
    const label = formatMatchWhen(row, zone, "en", "TBC");
    assert.equal(label, "01 SEP");
  }
});

test("an evening US instant keeps the viewer calendar day in four zones", () => {
  // 19:30 in New York on 11 Aug 2026 (EDT). Fixed instant; no system clock.
  const instant = "2026-08-11T23:30:00.000Z";
  const row = { scheduled_at: instant, has_time: true as const };
  const expected = {
    UTC: "2026-08-11",
    "America/New_York": "2026-08-11",
    "Europe/London": "2026-08-12",
    "Asia/Tokyo": "2026-08-12",
  } as const;
  for (const [zone, day] of Object.entries(expected)) {
    assert.equal(calendarDayInZone(instant, zone), day);
    const label = formatMatchWhen(row, zone, "en", "TBC");
    assert.match(label, new RegExp(`${day.slice(8, 10)} AUG`));
  }
  assert.match(formatMatchWhen(row, "America/New_York", "en", "TBC"), /11 AUG/);
  assert.match(formatMatchWhen(row, "Asia/Tokyo", "en", "TBC"), /12 AUG/);
  assert.match(formatMatchWhen(row, "Europe/London", "en", "TBC"), /12 AUG/);
});

test("viewer zone prefers a stored preference, then the browser, and stays unset otherwise", () => {
  assert.equal(viewerTimeZone({}), null);
  assert.equal(viewerTimeZone({ browserZone: null }), null);
  assert.equal(viewerTimeZone({ browserZone: "" }), "UTC");
  assert.equal(
    viewerTimeZone({ browserZone: "America/New_York" }),
    "America/New_York"
  );
  assert.equal(
    viewerTimeZone({
      preference: "Europe/London",
      browserZone: "America/New_York",
    }),
    "Europe/London"
  );
  assert.equal(captionTimeZone(null, "America/New_York"), "America/New_York");
  assert.equal(captionTimeZone(null, null), "UTC");
  assert.equal(captionTimeZone("Asia/Tokyo", "America/New_York"), "Asia/Tokyo");
});
