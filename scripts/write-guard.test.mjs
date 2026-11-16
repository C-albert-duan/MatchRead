// Fix list P2-8: ops scripts are dry by default and never move a past lock.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lockHasPassed, writeMode } from "./lib/write-guard.mjs";

test("dry-run is the default", () => {
  assert.deepEqual(writeMode([]), { write: false, dryRun: true, blocked: null });
  assert.deepEqual(writeMode(["--dry-run"]), { write: false, dryRun: true, blocked: null });
});

test("--write alone is blocked", () => {
  const mode = writeMode(["--write"]);
  assert.equal(mode.write, false);
  assert.match(mode.blocked, /--confirm-remote/);
});

test("--write --confirm-remote writes", () => {
  assert.deepEqual(writeMode(["--write", "--confirm-remote"]), { write: true, dryRun: false, blocked: null });
});

test("a passed lock is detected", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  assert.equal(lockHasPassed("2026-11-16T11:00:00Z", now), true);
  assert.equal(lockHasPassed("2026-11-17T11:00:00Z", now), false);
  assert.equal(lockHasPassed(null, now), false);
});
