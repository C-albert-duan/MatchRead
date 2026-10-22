// Thin live entry for sync-facts.
// Normalization, mapping, and the monotonic upsert stay in the provider package.
// Every raw row is archived in platform_events. A repeat of the same payload is one row.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { unknownLiveRecord } from "../../../packages/provider-rapidapi/src/live-frame.js";
import { retainNovelRawEvents } from "../../../packages/provider-rapidapi/src/live-archive.js";
import { ingestLiveFrames, persistUnknownLive } from "../../../packages/provider-rapidapi/src/live-ingest.js";
import { capturedTournamentId } from "../../../packages/provider-rapidapi/src/live.js";

type LiveEvent = {
  id: string;
  provider_id: string;
  slug: string;
};

export async function projectLiveBranch(
  admin: SupabaseClient,
  event: LiveEvent,
  liveEvents: unknown[],
  log: string[],
  dryRun: boolean,
  now?: string
) {
  return ingestLiveFrames(admin, event, liveEvents, { dryRun, log, now });
}

export async function acceptForwardedLive(
  admin: SupabaseClient,
  frames: Record<string, unknown>[],
  log: string[],
  opts?: { now?: string }
) {
  const fresh = (
    frames.length ? await retainNovelRawEvents(admin, frames, log) : []
  ) as Record<string, unknown>[];
  if (fresh.length < frames.length) log.push(`live duplicate ${frames.length - fresh.length}`);
  const groups = new Map<string, Record<string, unknown>[]>();
  const unparsed: ReturnType<typeof unknownLiveRecord>[] = [];
  let skipped = 0;
  for (const frame of fresh) {
    const tournamentId = capturedTournamentId(frame);
    if (!tournamentId) {
      skipped += 1;
      unparsed.push(unknownLiveRecord(frame, "unparsed match id"));
      continue;
    }
    const rows = groups.get(tournamentId) ?? [];
    rows.push(frame);
    groups.set(tournamentId, rows);
  }
  if (unparsed.length) await persistUnknownLive(admin, unparsed, log, { ops: false });
  const carriedProviderIds: string[] = [];
  let unmappedCarried = 0;
  if (!groups.size) {
    return { forwarded: frames.length, skipped, tournaments: 0, carriedProviderIds, unmappedCarried };
  }

  const { data, error } = await admin
    .from("tournaments")
    .select("id, slug, provider_id, ingestion_enabled")
    .in("provider_id", [...groups.keys()]);
  if (error) throw new Error(error.message);

  let tournaments = 0;
  for (const [providerId, rows] of groups) {
    const matches = (data ?? []).filter(
      (row) => String(row.provider_id) === providerId && row.ingestion_enabled !== false
    );
    if (matches.length !== 1) {
      skipped += rows.length;
      log.push(`live frames unmatched ${providerId}`);
      await persistUnknownLive(
        admin,
        rows.map((row) => unknownLiveRecord(row, "tournament not carried")),
        log,
        { ops: false }
      );
      continue;
    }
    const event = matches[0];
    tournaments += 1;
    carriedProviderIds.push(providerId);
    const projected = await projectLiveBranch(
      admin,
      {
        id: String(event.id),
        provider_id: providerId,
        slug: String(event.slug),
      },
      rows,
      log,
      false,
      opts?.now
    );
    unmappedCarried += Number(projected.unmapped || 0) + Number(projected.ambiguous || 0);
  }
  return { forwarded: frames.length, skipped, tournaments, carriedProviderIds, unmappedCarried };
}
