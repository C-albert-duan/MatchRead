/**
 * One POST for a provider tick. Every changed row from that read goes in
 * `liveFrames`. A match is not its own request.
 * Legacy ingest-events URLs are the sync-facts function.
 */

export function syncFactsUrl(ingestUrl: string): string {
  return ingestUrl
    .replace(/\/ingest-events\/?$/, "/sync-facts")
    .replace(/\/rebuild-draw\/?$/, "/sync-facts");
}

export async function forwardFrames(
  ingestUrl: string,
  secret: string,
  frames: unknown[],
  instanceId: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetchImpl(syncFactsUrl(ingestUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "live", liveFrames: frames, listenerInstanceId: instanceId }),
    signal,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

/** Empty `liveFrames` keeps an older sync-facts on the live return instead of a full ingest. */
export async function forwardHeartbeat(
  ingestUrl: string,
  secret: string,
  heartbeat: {
    connected: boolean;
    lastProviderEventAt: string | null;
    eventsReceived: number;
    mapped: number;
    unmapped: number;
    lagMs: number | null;
    tokenAgeS: number | null;
    instanceId: string;
  },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetchImpl(syncFactsUrl(ingestUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "live", liveFrames: [], listenerHeartbeat: heartbeat }),
    signal,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}
