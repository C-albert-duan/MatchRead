/**
 * Feed shape is a label. It does not explain a missing id.
 * No captured payload shows whether absence is completion, suspension,
 * a short list, or a feed error. Removal stays off.
 */

export const FEED_SHAPES = ["snapshot", "delta"] as const;

export type FeedShape = (typeof FEED_SHAPES)[number];

export function readFeedShape(env: { FEED_SHAPE?: string }): FeedShape | null {
  const raw = String(env.FEED_SHAPE ?? "").trim().toLowerCase();
  if (raw === "snapshot" || raw === "delta") return raw;
  return null;
}

export function removalEnabled(_shape: FeedShape | null): false {
  return false;
}

/** Ids remembered earlier and missing from this batch. Only a snapshot label is recorded. */
export function recordedAbsences(shape: FeedShape | null, known: Iterable<string>, frames: unknown[]): string[] {
  if (shape !== "snapshot") return [];
  const present = new Set<string>();
  for (const frame of frames) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) continue;
    const row = frame as Record<string, unknown>;
    const id = eventId(row.providerEventId) ?? eventId(row.provider_event_id) ?? eventId(row.id);
    if (id) present.add(id);
  }
  return [...known].filter((id) => !present.has(id)).sort();
}

function eventId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
