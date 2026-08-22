/**
 * Lock soundness — Sprint Directive 2.1 §3.4.
 * lock_at is an instant from the first timed main-draw ball, never a calendar date.
 */

export type LockTournament = {
  lock_at: string | Date | null | undefined;
  venue_tz?: string | null;
  main_draw_starts_on?: string | null;
  published_at?: string | null;
  bracket_eligible?: boolean | null;
};

export type LockFixture = {
  startsAt: string | Date | null | undefined;
  hasTime?: boolean | null;
};

export class LockSoundnessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LockSoundnessError";
    this.code = code;
  }
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Assert product lock is sound for an eligible / published tournament.
 * Throws LockSoundnessError when the lock would close mid-play or lacks zone.
 */
export function assertLockIsSound(
  t: LockTournament,
  firstTimedR0: LockFixture | null
): void {
  if (t.bracket_eligible === false) return;

  const zone = (t.venue_tz || "").trim();
  if (!zone) {
    throw new LockSoundnessError(
      "missing_zone",
      "Eligible tournament requires venue_tz (IANA)"
    );
  }

  const lock = toDate(t.lock_at ?? null);
  if (!lock) {
    // No timed first ball yet — allowed until schedule lands.
    if (!firstTimedR0?.startsAt) return;
    throw new LockSoundnessError(
      "missing_lock",
      "Timed first ball exists but lock_at is null"
    );
  }

  const first = toDate(firstTimedR0?.startsAt ?? null);
  if (first && firstTimedR0?.hasTime !== false) {
    if (lock.getTime() > first.getTime()) {
      throw new LockSoundnessError(
        "lock_after_first_ball",
        `lock_at ${lock.toISOString()} is after first ball ${first.toISOString()} — brackets would close mid-play`
      );
    }
  }
}

/** True when assertLockIsSound would throw. */
export function isLockUnsound(
  t: LockTournament,
  firstTimedR0: LockFixture | null
): boolean {
  try {
    assertLockIsSound(t, firstTimedR0);
    return false;
  } catch (e) {
    return e instanceof LockSoundnessError;
  }
}
