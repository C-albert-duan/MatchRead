/**
 * Two listener processes posting at once.
 * The result is a warning. It does not drop frames or pick a leader.
 */

/** Concurrent when the previous id was written inside this window. */
export const LISTENER_OVERLAP_MS = 15 * 60 * 1000;

/**
 * @param {{ instanceId?: string | null, seenAt?: string | null } | null | undefined} previous
 * @param {unknown} incoming
 * @param {number} nowMs
 * @param {number} [windowMs]
 */
export function listenerOverlap(previous, incoming, nowMs, windowMs = LISTENER_OVERLAP_MS) {
  const current = clean(incoming);
  if (!current) return { overlap: false, instanceId: null, warning: null };
  const prior = clean(previous?.instanceId);
  const seenAt = Date.parse(String(previous?.seenAt ?? ""));
  const age = nowMs - seenAt;
  const fresh = Number.isFinite(seenAt) && age >= 0 && age <= windowMs;
  if (prior && prior !== current && fresh) {
    return {
      overlap: true,
      instanceId: current,
      warning: {
        kind: "live",
        name: "listener_overlap",
        payload: { previous: prior, current },
      },
    };
  }
  return { overlap: false, instanceId: current, warning: null };
}

/**
 * @param {unknown} value
 */
function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}
