import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTournamentDate } from "./dates.ts";

test("formats a single day without a raw ISO string", () => {
  const out = formatTournamentDate("2026-08-03", "en");
  assert.equal(out, "3 Aug 2026");
  assert.ok(out && !out.includes("2026-08"));
});

test("formats a same-month range", () => {
  assert.equal(
    formatTournamentDate("2026-08-13", "en", "2026-08-23"),
    "13–23 Aug 2026"
  );
});

test("formats a cross-month range", () => {
  assert.equal(
    formatTournamentDate("2026-08-30", "en", "2026-09-13"),
    "30 Aug – 13 Sep 2026"
  );
});
