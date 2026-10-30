/**
 * Custom league schedule: input parsing and error codes for the Server
 * Actions. No action takes a UUID: the browser sends the league slug and the
 * tournament slug (ref). Codes cross the wire; copy lives in i18n.
 */

export type ScheduleErrorCode =
  | "signed_out"
  | "invalid"
  | "unauthorized"
  | "not_found"
  | "tournament_locked"
  | "tournament_ineligible"
  | "single_tournament_league"
  | "schedule_not_custom"
  | "brackets_exist"
  | "last_tournament"
  | "network"
  | "unknown";

export type ScheduleStatusCode =
  | "added"
  | "already_added"
  | "removed"
  | "not_on_schedule"
  | "custom"
  | "already_custom";

export type ScheduleResult =
  | { ok: true; status: ScheduleStatusCode }
  | { ok: false; code: ScheduleErrorCode };

export type ScheduleChangeInput = { slug: string; tournamentRef: string };

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRef(value: unknown): value is string {
  return typeof value === "string" && SLUG.test(value) && !UUID.test(value);
}

export function parseLeagueSlug(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const slug = (raw as { slug?: unknown }).slug;
  return isRef(slug) ? slug : null;
}

export function parseScheduleChange(raw: unknown): ScheduleChangeInput | null {
  const slug = parseLeagueSlug(raw);
  const ref = (raw as { tournamentRef?: unknown } | null)?.tournamentRef;
  if (!slug || !isRef(ref)) return null;
  return { slug, tournamentRef: ref };
}

const DETAIL_CODES: ReadonlySet<ScheduleErrorCode> = new Set([
  "unauthorized",
  "not_found",
  "tournament_locked",
  "tournament_ineligible",
  "single_tournament_league",
  "schedule_not_custom",
  "brackets_exist",
  "last_tournament",
]);

/** Map a Postgres error by SQLSTATE + DETAIL. Never parses the message. */
export function scheduleErrorCode(
  error: { code?: string | null; details?: string | null } | null | undefined
): ScheduleErrorCode {
  const detail = (error?.details ?? "") as ScheduleErrorCode;
  if (DETAIL_CODES.has(detail)) return detail;
  if (error?.code === "42501") return "unauthorized";
  if (error?.code === "P0002") return "not_found";
  return "unknown";
}

const STATUSES: ReadonlySet<string> = new Set([
  "added",
  "already_added",
  "removed",
  "not_on_schedule",
  "custom",
  "already_custom",
]);

export function scheduleStatusFrom(data: unknown): ScheduleStatusCode | null {
  const status = (data as { status?: unknown } | null)?.status;
  return typeof status === "string" && STATUSES.has(status)
    ? (status as ScheduleStatusCode)
    : null;
}
