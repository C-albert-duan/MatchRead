import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlatformLocked, isTournamentLocked } from "./types.ts";

const now = new Date("2026-08-12T12:00:00.000Z");

test("platform first-ball lock is independent of a league lock", () => {
  assert.equal(
    isPlatformLocked({
      lock_at: "2026-08-13T17:00:00.000Z",
      admin_locked_at: null,
      now,
    }),
    false
  );
  assert.equal(
    isTournamentLocked({
      lock_at: "2026-08-13T17:00:00.000Z",
      admin_locked_at: null,
      league_locked_at: "2026-08-11T12:00:00.000Z",
      now,
    }),
    true
  );
});

test("a league lock does not make isPlatformLocked true", () => {
  assert.equal(
    isPlatformLocked({
      lock_at: "2026-08-13T17:00:00.000Z",
      admin_locked_at: null,
      now,
    }),
    false
  );
});
