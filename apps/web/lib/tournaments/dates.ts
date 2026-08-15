/** Draw-sheet date or range: `13–23 Aug 2026`. Month follows the locale. Never a raw ISO date. */
export function formatTournamentDate(
  startsOn: string | null,
  locale: string,
  endsOn?: string | null
): string | null {
  if (!startsOn) return null;
  const start = parseDay(startsOn);
  if (!start) return startsOn.includes("T") ? startsOn.slice(0, 10) : startsOn;
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
  return d
    .toLocaleString(locale, { month: "short", timeZone: "UTC" })
    .replace(".", "");
}

function formatOneDay(d: Date, locale: string): string {
  return `${d.getUTCDate()} ${monthShort(d, locale)} ${d.getUTCFullYear()}`;
}
