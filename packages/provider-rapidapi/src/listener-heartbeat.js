/**
 * Latest listener tick stored on listener_health id "listener".
 * Replay counters stay on the "sync-facts" row. The token, provider key,
 * and ingest secret are not fields on this row.
 */

export const HEARTBEAT_MS = 30_000;
export const LISTENER_HEALTH_ID = "listener";

export function heartbeatDue(lastAt, now) {
  if (lastAt == null) return true;
  return now - lastAt >= HEARTBEAT_MS;
}

/** Wait until the next provider read or the next heartbeat, whichever is sooner. */
export function nextWakeMs(now, nextReadAt, nextBeatAt) {
  const wait = Math.min(nextReadAt, nextBeatAt) - now;
  if (!Number.isFinite(wait)) return 0;
  return Math.max(0, wait);
}

/**
 * @param {unknown} input
 * @param {string} nowIso
 * @returns {Record<string, unknown> | null}
 */
export function listenerHealthRow(input, nowIso) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const beat = /** @type {Record<string, unknown>} */ (input);
  if (typeof beat.connected !== "boolean") return null;
  const eventsReceived = count(beat.eventsReceived);
  const mapped = count(beat.mapped);
  const unmapped = count(beat.unmapped);
  if (eventsReceived == null || mapped == null || unmapped == null) return null;
  if (mapped + unmapped !== eventsReceived) return null;
  if (beat.lagMs != null && count(beat.lagMs) == null) return null;
  if (beat.tokenAgeS != null && count(beat.tokenAgeS) == null) return null;
  const lastFrame = eventAt(beat.lastProviderEventAt);
  if (beat.lastProviderEventAt != null && lastFrame == null) return null;
  if (typeof beat.instanceId !== "string") return null;
  const instanceId = beat.instanceId.trim();
  if (!instanceId || instanceId.length > 200 || /[\r\n]/.test(instanceId)) return null;
  if (typeof nowIso !== "string" || !Number.isFinite(Date.parse(nowIso))) return null;

  return {
    id: LISTENER_HEALTH_ID,
    transport: "rest",
    connection: beat.connected ? "up" : "down",
    last_frame_at: lastFrame,
    last_error: beat.connected ? null : "provider read failed",
    instance_id: instanceId,
    events_received: eventsReceived,
    mapped_count: mapped,
    unmapped_count: unmapped,
    lag_ms: beat.lagMs == null ? null : count(beat.lagMs),
    token_age_s: beat.tokenAgeS == null ? null : count(beat.tokenAgeS),
    last_heartbeat_at: new Date(nowIso).toISOString(),
    updated_at: new Date(nowIso).toISOString(),
  };
}

function count(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000_000) {
    return null;
  }
  return value;
}

function eventAt(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}
