/** Client-safe tournament formatters. No next/headers, no Supabase. */

export const DAY_MS = 86_400_000;

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

/** Lock instant in the given IANA zone — day word when near, never a bare clock. */
export function formatLockWhen(
  lockAt: string,
  timeZone: string,
  locale: string,
  labels: { today: string; tomorrow: string },
  now: Date = new Date()
) {
  const zone = timeZone || "UTC";
  const target = new Date(lockAt);
  const dayFmt = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const longFmt = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const targetDay = dayFmt.format(target);
  const todayDay = dayFmt.format(now);
  const tomorrow = new Date(now.getTime() + DAY_MS);
  const tomorrowDay = dayFmt.format(tomorrow);
  const clock = timeFmt.format(target);

  if (targetDay === todayDay) return `${labels.today} ${clock}`;
  if (targetDay === tomorrowDay) return `${labels.tomorrow} ${clock}`;
  return `${longFmt.format(target)}, ${clock}`;
}
