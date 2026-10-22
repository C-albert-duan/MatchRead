/**
 * Live branch of the one ingest function. `mode: "live"` is that branch.
 * A `liveFrames` array is the same branch when mode is omitted.
 * There is no second endpoint.
 *
 * @param {unknown} body
 * @returns {{ live: boolean, error?: string, frames?: unknown[] }}
 */
export function liveIngestRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { live: false };
  const record = /** @type {Record<string, unknown>} */ (body);
  const mode = typeof record.mode === "string" ? record.mode.trim() : "";
  if (mode && mode !== "live") return { live: false, error: "mode is not live" };
  const hasFrames = Array.isArray(record.liveFrames);
  if (mode === "live" && !hasFrames) return { live: false, error: "live mode requires liveFrames" };
  if (!hasFrames) return { live: false };
  if (
    record.liveFrames.some((row) => !row || typeof row !== "object" || Array.isArray(row))
  ) {
    return { live: true, error: "liveFrames must be objects" };
  }
  return { live: true, frames: record.liveFrames };
}
