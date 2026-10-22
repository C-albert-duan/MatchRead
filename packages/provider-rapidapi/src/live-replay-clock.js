/**
 * Virtual clock for a recorded live timeline.
 * Each step takes that event's own timestamp. The gap is recorded and not waited.
 */

/**
 * @param {unknown} frame
 * @returns {number | null}
 */
export function eventInstantMs(frame) {
  if (!frame || typeof frame !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (frame);
  const received = record.receivedAt ?? record.received_at;
  if (typeof received === "string") {
    const ms = Date.parse(received);
    if (Number.isFinite(ms)) return ms;
  }
  const updated = record.updatedAt ?? record.updated_at;
  if (typeof updated === "number" && Number.isFinite(updated)) return updated;
  if (typeof updated === "string") {
    if (/^\d{12,16}$/.test(updated)) {
      const ms = Number(updated);
      return Number.isFinite(ms) ? ms : null;
    }
    const ms = Date.parse(updated);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Walk frames in file order. `sleptMs` stays 0: an eleven-hour gap is not a wait.
 * @param {unknown[]} frames
 */
export function walkReplayClock(frames) {
  /** @type {number | null} */
  let nowMs = null;
  /** @type {number | null} */
  let firstMs = null;
  let gapMs = 0;
  /** @type {Array<number | null>} */
  const steps = [];
  for (const frame of frames) {
    const at = eventInstantMs(frame);
    if (at == null) {
      steps.push(nowMs);
      continue;
    }
    if (firstMs == null) firstMs = at;
    if (nowMs != null && at > nowMs) gapMs += at - nowMs;
    nowMs = at;
    steps.push(nowMs);
  }
  const endMs = nowMs ?? firstMs;
  return {
    nowMs: endMs,
    iso: endMs == null ? null : new Date(endMs).toISOString(),
    spanMs: firstMs == null || endMs == null ? 0 : endMs - firstMs,
    gapMs,
    sleptMs: 0,
    steps,
  };
}
