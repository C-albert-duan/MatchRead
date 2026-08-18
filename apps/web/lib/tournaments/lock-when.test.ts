import assert from "node:assert/strict";
import { test } from "node:test";
import { formatLockWhen } from "./format.ts";

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
