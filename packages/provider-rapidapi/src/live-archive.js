/**
 * Raw provider event log. Receipt time is not part of the content hash,
 * matching the listener's change comparison. Token and secret fields are
 * omitted. A repeated hash is one row.
 */
import { canonicalJson, sha256Hex } from "./official/draw-hash.js";

const RECEIPT_KEYS = new Set(["receivedAt", "received_at", "capturedAt", "captured_at"]);
const SECRET_KEY = /token|secret|authorization|api[-_]?key|rapidapi/i;
const JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

export function rawEventBody(value) {
  if (Array.isArray(value)) return value.map((item) => rawEventBody(item));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && JWT.test(value)) return null;
    return value;
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (RECEIPT_KEYS.has(key) || SECRET_KEY.test(key)) continue;
    out[key] = rawEventBody(value[key]);
  }
  return out;
}

/**
 * @param {unknown} frame
 * @returns {Promise<{ content_hash: string, provider_event_id: string | null, payload: Record<string, unknown> } | null>}
 */
export async function rawEventRow(frame) {
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) return null;
  const payload = rawEventBody(frame);
  const id = payload.id ?? payload.providerEventId ?? payload.provider_event_id ?? null;
  const providerEventId =
    typeof id === "string" && id.trim()
      ? id.trim()
      : typeof id === "number" && Number.isFinite(id)
        ? String(id)
        : null;
  return {
    content_hash: await sha256Hex(canonicalJson(payload)),
    provider_event_id: providerEventId,
    payload,
  };
}

/**
 * Store distinct raw rows and return only the frames that were newly inserted.
 * A hash already in platform_events is not projected again.
 * If the log cannot be written, every frame is returned so the live row can still update.
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {unknown[]} frames
 * @param {string[]} [log]
 */
export async function retainNovelRawEvents(admin, frames, log = []) {
  /** @type {Map<string, { frame: unknown, row: Awaited<ReturnType<typeof rawEventRow>> }>} */
  const byHash = new Map();
  const unhashed = [];
  for (const frame of frames) {
    const row = await rawEventRow(frame);
    if (!row) {
      unhashed.push(frame);
      continue;
    }
    if (!byHash.has(row.content_hash)) byHash.set(row.content_hash, { frame, row });
  }
  const rows = [...byHash.values()].map((item) => item.row);
  if (!rows.length) return unhashed;
  const { data, error } = await admin
    .from("platform_events")
    .upsert(rows, { onConflict: "content_hash", ignoreDuplicates: true })
    .select("content_hash");
  if (error) {
    log.push(`platform_events archive skipped: ${error.message}`);
    return frames;
  }
  const inserted = new Set((data ?? []).map((row) => row.content_hash));
  const novel = [];
  for (const item of byHash.values()) {
    if (item.row && inserted.has(item.row.content_hash)) novel.push(item.frame);
  }
  return [...novel, ...unhashed];
}
