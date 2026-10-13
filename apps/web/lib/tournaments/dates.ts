import { formatUtcMonth } from "./format.ts";

/**
 * Draw-sheet date or range: `13–23 Aug 2026`.
 * These are calendar dates, not instants. Month follows the locale in UTC.
 * Viewer-local clocks go through format.ts. An unreadable value is null.
 */
export function formatTournamentDate(
  startsOn: string | null,
  locale: string,
  endsOn?: string | null
): string | null {
  if (!startsOn) return null;
  const start = parseDay(startsOn);
  if (!start) return null;
  const end = endsOn ? parseDay(endsOn) : null;
  if (!end || end.getTime() === start.getTime()) {
    return formatOneDay(start, locale);
  }
  const sm = monthShort(start, locale);
  const em = monthShort(end, locale);
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  if (sm === em && sy === ey) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${sm} ${sy}`;
  }
  if (sy === ey) {
    return `${start.getUTCDate()} ${sm} – ${end.getUTCDate()} ${em} ${ey}`;
  }
  return `${formatOneDay(start, locale)} – ${formatOneDay(end, locale)}`;
}

function parseDay(value: string): Date | null {
  const d = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthShort(d: Date, locale: string): string {
  return formatUtcMonth(d, locale);
}

function formatOneDay(d: Date, locale: string): string {
  return `${d.getUTCDate()} ${monthShort(d, locale)} ${d.getUTCFullYear()}`;
}
