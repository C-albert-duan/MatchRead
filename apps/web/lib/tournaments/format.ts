/** Client-safe tournament formatters. No next/headers, no Supabase. */

export type MatchScheduleRow = {
  scheduled_at: string;
  has_time: boolean;
};

/** Per-match when: `11 AUG · 14:00`, or the date alone when no clock is known. */
export function formatMatchWhen(
  row: MatchScheduleRow | null | undefined,
  venueTz: string,
  locale: string,
  tbc: string
): string {
  if (!row?.scheduled_at) return tbc;
  const d = new Date(row.scheduled_at);
  if (Number.isNaN(d.getTime())) return tbc;
  const zone = venueTz || "UTC";
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    day: "2-digit",
  }).format(d);
  const month = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    month: "short",
  })
    .format(d)
    .replace(".", "")
    .toUpperCase();
  const date = `${day} ${month}`;
  if (!row.has_time) return date;
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${date} · ${time}`;
}
