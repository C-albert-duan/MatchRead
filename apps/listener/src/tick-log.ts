/**
 * One JSON line per provider read. The info channel is the structured log.
 * `flags` is 1 only when ingest reports that a frame for a carried tournament
 * did not map to one match. A feed of other tours can leave `unmapped` high.
 * That count is not the alarm. Player names are not an identity.
 */
import { capturedTournamentId } from "@matchread/provider-rapidapi";

export type TickLog = {
  ts: string;
  job: "listener";
  conn: "up" | "down";
  events_in: number;
  mapped: number;
  unmapped: number;
  changed: number;
  posted: number;
  flags: number;
  lag_ms: number | null;
  token_age_s: number | null;
};

export function tournamentIdOf(frame: unknown): string | null {
  return capturedTournamentId(frame);
}

export function tickCoverage(frames: unknown[], carried: ReadonlySet<string>): {
  events_in: number;
  mapped: number;
  unmapped: number;
} {
  let mapped = 0;
  for (const frame of frames) {
    const tournamentId = tournamentIdOf(frame);
    if (tournamentId && carried.has(tournamentId)) mapped += 1;
  }
  const events_in = frames.length;
  return { events_in, mapped, unmapped: events_in - mapped };
}

/** Alarm when a carried tournament's event did not map. `unmapped` alone is not that. */
export function tickFlags(unmappedCarried: number): number {
  if (!Number.isInteger(unmappedCarried) || unmappedCarried <= 0) return 0;
  return 1;
}

export function unmappedCarriedFrom(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const value = (body as { unmappedCarried?: unknown }).unmappedCarried;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return 0;
  return value;
}

export function providerEventAt(frames: unknown[], now: number): string | null {
  const lag = lagMs(frames, now);
  if (lag == null) return null;
  return new Date(now - lag).toISOString();
}

export function lagMs(frames: unknown[], now: number): number | null {
  let newest: number | null = null;
  for (const frame of frames) {
    const clock = providerClock(frame);
    if (clock == null) continue;
    if (newest == null || clock > newest) newest = clock;
  }
  if (newest == null) return null;
  return Math.max(0, now - newest);
}

export function carriedIdsFrom(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const ids = (body as { carriedProviderIds?: unknown }).carriedProviderIds;
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id ?? "").trim()).filter(Boolean);
}

export function tickLine(row: TickLog & { level: "info" | "warn" }): string {
  return JSON.stringify(row);
}

function providerClock(frame: unknown): number | null {
  if (!frame || typeof frame !== "object") return null;
  const value = (frame as { updatedAt?: unknown }).updatedAt;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d{12,16}$/.test(value)) return Number(value);
  return null;
}
