/**
 * The viewer's IANA zone, for server-rendered copy that depends on the time
 * of day (fix list P2-7). The browser writes it (ViewerZoneCookie); the
 * server reads it. Without it the server must not guess: its own clock is
 * UTC, which is wrong for most viewers.
 */
export const VIEWER_ZONE_COOKIE = "mh_tz";

/** A zone Intl accepts, or null. Never trusts the cookie blindly. */
export function validTimeZone(raw: string | null | undefined): string | null {
  const zone = raw?.trim();
  if (!zone || zone.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/** Hour of day (0-23) at `now` in `timeZone`. */
export function hourInZone(timeZone: string, now: Date = new Date()): number {
  const text = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone,
  }).format(now);
  return Number(text) % 24;
}
