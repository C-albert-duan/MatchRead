/**
 * Founder integrity signals from rows the listener and ingest already store.
 * Error is the existing ops kind for a heartbeat gap during play and for a
 * REST disagreement. Event is the existing ops kind for a quiet provider
 * clock. A high unmapped count is not an alarm. An event for a carried
 * tournament that did not map is the event mark. This does not write those rows.
 */

export const HEARTBEAT_ALARM_MS = 2 * 60 * 1000;
export const PROVIDER_EVENT_ALARM_MS = 5 * 60 * 1000;

export type HealthLevel = "ok" | "event" | "error";

export type ListenerTick = {
  connection: string | null;
  lastHeartbeatAt: string | null;
  lastProviderEventAt: string | null;
  eventsIn: number | null;
  mapped: number | null;
  unmapped: number | null;
  lagMs: number | null;
};

export type LiveHealthInput = {
  now: number;
  listener: ListenerTick | null;
  /** A live row is in play. */
  activePlay: boolean;
  /** A live row is in play or suspended. */
  expectedPlay: boolean;
  disagreements: number;
  carriedUnmapped: number;
  /** Integrity warning code `freshness` is already on a report. */
  drawFreshness: boolean;
};

export type LiveHealth = {
  connected: boolean;
  heartbeat: { at: string | null; level: HealthLevel };
  providerEvent: { at: string | null; level: HealthLevel };
  mapping: {
    eventsIn: number | null;
    mapped: number | null;
    unmapped: number | null;
    level: HealthLevel;
  };
  carriedUnmapped: { count: number; level: HealthLevel };
  disagreement: { count: number; level: HealthLevel };
  providerFreshness: { lagMs: number | null; drawFreshness: boolean } | null;
};

export function latestInstant(left: string | null, right: string | null): string | null {
  const a = instant(left);
  const b = instant(right);
  if (a == null && b == null) return null;
  if (a == null) return right;
  if (b == null) return left;
  return a >= b ? left : right;
}

export function hasFreshnessWarning(warnings: unknown): boolean {
  if (!Array.isArray(warnings)) return false;
  return warnings.some(
    (item) =>
      item != null &&
      typeof item === "object" &&
      (item as { code?: unknown }).code === "freshness"
  );
}

export function founderLiveHealth(input: LiveHealthInput): LiveHealth {
  const listener = input.listener;
  const heartbeatAt = listener?.lastHeartbeatAt ?? null;
  const heartbeatAge = ageMs(heartbeatAt, input.now);
  const heartbeatAlarm =
    input.activePlay && (heartbeatAge == null || heartbeatAge > HEARTBEAT_ALARM_MS);

  const providerAt = listener?.lastProviderEventAt ?? null;
  const providerAge = ageMs(providerAt, input.now);
  const providerAlarm =
    input.expectedPlay && (providerAge == null || providerAge > PROVIDER_EVENT_ALARM_MS);

  const eventsIn = listener?.eventsIn ?? null;
  const mapped = listener?.mapped ?? null;
  const unmapped = listener?.unmapped ?? null;

  const lagMs = listener?.lagMs ?? null;
  const providerFreshness =
    lagMs == null && !input.drawFreshness
      ? null
      : { lagMs, drawFreshness: input.drawFreshness };

  return {
    connected: listener?.connection === "up",
    heartbeat: { at: heartbeatAt, level: heartbeatAlarm ? "error" : "ok" },
    providerEvent: { at: providerAt, level: providerAlarm ? "event" : "ok" },
    mapping: {
      eventsIn,
      mapped,
      unmapped,
      level: "ok",
    },
    carriedUnmapped: {
      count: input.carriedUnmapped,
      level: input.carriedUnmapped > 0 ? "event" : "ok",
    },
    disagreement: {
      count: input.disagreements,
      level: input.disagreements > 0 ? "error" : "ok",
    },
    providerFreshness,
  };
}

/**
 * Count ops rows whose tournament id is one this product carries.
 * A row without that id, or a name in its place, does not count.
 */
export function carriedMappingMisses(
  events: unknown[],
  carriedIds: ReadonlySet<string>
): number {
  let count = 0;
  for (const event of events) {
    const id = opsTournamentId(event);
    if (id && carriedIds.has(id)) count += 1;
  }
  return count;
}

function opsTournamentId(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const payload = (event as { payload?: unknown }).payload;
  if (!payload || typeof payload !== "object") return null;
  const id = (payload as { provider_tournament_id?: unknown }).provider_tournament_id;
  if (typeof id === "number" && Number.isFinite(id)) return String(Math.trunc(id));
  if (typeof id !== "string") return null;
  const text = id.trim();
  if (!text || /\s/.test(text)) return null;
  return text;
}

function instant(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function ageMs(value: string | null, now: number): number | null {
  const ms = instant(value);
  if (ms == null) return null;
  return now - ms;
}
