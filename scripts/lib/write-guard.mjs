/**
 * Shared write gate for ops scripts that change a remote project
 * (fix list P2-8). Dry-run is the default. A write needs both --write and
 * --confirm-remote, the same rule the backfill scripts follow.
 */

/**
 * @param {string[]} argv
 * @returns {{ write: boolean, dryRun: boolean, blocked: string | null }}
 */
export function writeMode(argv) {
  const write = argv.includes("--write");
  const confirmed = argv.includes("--confirm-remote");
  if (write && !confirmed) {
    return {
      write: false,
      dryRun: true,
      blocked:
        "BLOCKED: --write changes the remote project. Add --confirm-remote to apply. Nothing was written.",
    };
  }
  return { write, dryRun: !write, blocked: null };
}

/** True when the lock has passed: picks are fixed, so it must not move. */
export function lockHasPassed(lockAt, now = Date.now()) {
  if (!lockAt) return false;
  const at = Date.parse(String(lockAt));
  return Number.isFinite(at) && at <= now;
}
