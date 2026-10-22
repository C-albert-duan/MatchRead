/**
 * Changed raw provider rows. No score parsing and no database writes.
 * Last-known state stays when an id is missing from a batch. The socket
 * payload shape was not captured, so a short batch is not treated as a
 * full replacement of the live list.
 */

export type ProviderFrame = Record<string, unknown>;

const RECEIPT_KEYS = new Set(["receivedAt", "received_at", "capturedAt", "captured_at"]);

export function providerEventId(frame: ProviderFrame): string | null {
  return eventId(frame.providerEventId) ?? eventId(frame.provider_event_id) ?? eventId(frame.id);
}

function eventId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function compared(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compared);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (RECEIPT_KEYS.has(key)) continue;
    out[key] = compared(record[key]);
  }
  return out;
}

export function frameSignature(frame: ProviderFrame): string {
  return JSON.stringify(compared(frame));
}

/** True when two raw rows are the same ingest, ignoring receipt time. */
export function equalForIngest(left: ProviderFrame, right: ProviderFrame): boolean {
  return frameSignature(left) === frameSignature(right);
}

export function createListenerSession() {
  const seen = new Map<string, ProviderFrame>();
  const carried = new Set<string>();
  let absenceNote = "";
  let pendingUndo: Array<{ key: string; previous: ProviderFrame | undefined }> | null = null;

  return {
    noteCarried(ids: readonly string[]) {
      for (const id of ids) {
        const text = id.trim();
        if (text) carried.add(text);
      }
    },
    carriedIds(): string[] {
      return [...carried];
    },
    knownEventIds(): string[] {
      return [...seen.keys()].sort();
    },
    /** True when the recorded absence set changes. Does not drop stored rows. */
    recordUnprovenAbsence(ids: readonly string[]): boolean {
      const note = ids.join("\n");
      if (note === absenceNote) return false;
      absenceNote = note;
      return true;
    },
    takeChanged(frames: unknown[]): ProviderFrame[] {
      const changed: ProviderFrame[] = [];
      pendingUndo = [];
      for (const frame of frames) {
        if (!frame || typeof frame !== "object" || Array.isArray(frame)) continue;
        const row = frame as ProviderFrame;
        const key = providerEventId(row);
        if (!key) continue;
        const previous = seen.get(key);
        if (previous && equalForIngest(previous, row)) continue;
        pendingUndo.push({ key, previous });
        changed.push(row);
        seen.set(key, row);
      }
      return changed;
    },
    /** A failed post must send the same rows again. */
    releaseLastTake() {
      if (!pendingUndo) return;
      for (let index = pendingUndo.length - 1; index >= 0; index -= 1) {
        const step = pendingUndo[index];
        if (!step) continue;
        if (step.previous) seen.set(step.key, step.previous);
        else seen.delete(step.key);
      }
      pendingUndo = null;
    },
    commitLastTake() {
      pendingUndo = null;
    },
  };
}
