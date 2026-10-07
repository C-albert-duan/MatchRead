/**
 * One schedule parser for fixtures and the official overlay.
 *
 * A provider date with no real clock is the civil `YYYY-MM-DD` in that
 * string, stored at noon UTC with `has_time: false`. Midnight (`T00:00`)
 * is not a kickoff, including when it carries `Z` or a numeric offset.
 * A clock with no offset is that UTC clock. It is never read in the
 * process timezone.
 */

const DAY = /^(\d{4}-\d{2}-\d{2})$/;
const DATE_TIME =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const CLOCK_FIELD =
  /^(\d{1,2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * @param {string} ymd
 * @returns {{ scheduled_at: string, has_time: false } | null}
 */
function civilDate(ymd) {
  if (!DAY.test(ymd)) return null;
  const scheduled_at = `${ymd}T12:00:00.000Z`;
  if (Number.isNaN(Date.parse(scheduled_at))) return null;
  return { scheduled_at, has_time: false };
}

/**
 * @param {string} hh
 * @param {string} mm
 * @param {string | undefined} ss
 */
function isMidnight(hh, mm, ss) {
  return hh === "00" && mm === "00" && (ss == null || ss === "00");
}

/**
 * @param {string} raw
 * @returns {{ scheduled_at: string, has_time: boolean } | null}
 */
function instantFromDateTime(raw) {
  const timed = raw.match(DATE_TIME);
  if (!timed) return null;
  const ymd = timed[1];
  const hh = timed[2];
  const mm = timed[3];
  const ss = timed[4];
  const offset = timed[5] || "";
  if (isMidnight(hh, mm, ss)) return civilDate(ymd);
  if (offset) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return { scheduled_at: d.toISOString(), has_time: true };
  }
  const scheduled_at = `${ymd}T${hh}:${mm}:${ss || "00"}.000Z`;
  if (Number.isNaN(Date.parse(scheduled_at))) return null;
  return { scheduled_at, has_time: true };
}

/**
 * Parse a provider fixture or result into a stored instant.
 * Date-only values do not invent a kickoff clock (`has_time: false`).
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {{ scheduled_at: string, has_time: boolean } | null}
 */
export function parseFixtureInstant(row) {
  if (!row || typeof row !== "object") return null;
  const rawDate = String(
    row.date ?? row.start ?? row.startDate ?? row.datetime ?? ""
  ).trim();
  if (!rawDate) return null;

  if (rawDate.includes("T")) return instantFromDateTime(rawDate);

  const day = rawDate.slice(0, 10);
  if (!DAY.test(day) || day !== rawDate) return null;

  const rawTime = String(row.time ?? row.startTime ?? row.hour ?? "").trim();
  const hm = rawTime.match(CLOCK_FIELD);
  if (hm) {
    const hh = String(hm[1]).padStart(2, "0");
    const mm = hm[2];
    const ss = hm[3] || "00";
    const offset = hm[4] || "";
    if (isMidnight(hh, mm, ss)) return civilDate(day);
    if (offset) {
      const d = new Date(`${day}T${hh}:${mm}:${ss}${offset}`);
      if (Number.isNaN(d.getTime())) return null;
      return { scheduled_at: d.toISOString(), has_time: true };
    }
    const scheduled_at = `${day}T${hh}:${mm}:${ss}.000Z`;
    if (Number.isNaN(Date.parse(scheduled_at))) return null;
    return { scheduled_at, has_time: true };
  }

  return civilDate(day);
}
