/** Same window as live_overlay_open. A quiet listener is not a live overlay. */
export const LIVE_LAYER_STALE_MS = 90_000;

export type ListenerBeat = {
  connection?: string | null;
  lastHeartbeatAt?: string | null;
};

/** Live overlay only while the listener reports the provider read is up and recent. */
export function liveLayerOpen(beat: ListenerBeat | null | undefined, now: number): boolean {
  if (!beat || beat.connection !== "up") return false;
  const at = Date.parse(beat.lastHeartbeatAt ?? "");
  if (!Number.isFinite(at)) return false;
  return now - at <= LIVE_LAYER_STALE_MS;
}

/** A snapshot may paint only when the route says the overlay is open. */
export function liveSnapshotOpen(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as { live?: unknown }).live !== false;
}
