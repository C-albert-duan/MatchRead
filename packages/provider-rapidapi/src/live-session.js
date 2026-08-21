/**
 * Live session state machine helpers (reconcile-then-resume).
 * Socket paints only; REST is authoritative for settlement triggers.
 */

export const LiveConnectionState = {
  CONNECTED: "CONNECTED",
  STALE: "STALE",
  RESYNCING: "RESYNCING",
  SUBSCRIBED: "SUBSCRIBED",
  DEGRADED: "DEGRADED",
};

/**
 * @returns {{
 *   state: string,
 *   desiredEventIds: Set<string>,
 *   joinedEventIds: Set<string>,
 *   lastRestSyncAt: string|null,
 *   lastSocketMessageAt: string|null,
 *   reconnectCount: number,
 * }}
 */
export function createLiveSessionState() {
  return {
    state: LiveConnectionState.DEGRADED,
    desiredEventIds: new Set(),
    joinedEventIds: new Set(),
    lastRestSyncAt: null,
    lastSocketMessageAt: null,
    reconnectCount: 0,
    allowJoin: false,
  };
}

/** Mark transport lost — do not trust cached live scores. */
export function onSocketDisconnect(session) {
  session.state = LiveConnectionState.STALE;
  session.allowJoin = false;
  session.joinedEventIds.clear();
  session.reconnectCount += 1;
  return session;
}

/**
 * After disconnect: REST sweep must complete before joins.
 * @param {ReturnType<typeof createLiveSessionState>} session
 * @param {() => Promise<void>} restSweep
 */
export async function reconcileThenResume(session, restSweep) {
  session.state = LiveConnectionState.RESYNCING;
  session.allowJoin = false;
  await restSweep();
  session.lastRestSyncAt = new Date().toISOString();
  session.allowJoin = true;
  session.state = LiveConnectionState.SUBSCRIBED;
  return session;
}

/**
 * Diff desired vs joined; only when allowJoin.
 * @returns {{ toJoin: string[], toLeave: string[] }}
 */
export function subscriptionDiff(session) {
  if (!session.allowJoin) {
    return { toJoin: [], toLeave: [] };
  }
  const toJoin = [];
  const toLeave = [];
  for (const id of session.desiredEventIds) {
    if (!session.joinedEventIds.has(id)) toJoin.push(id);
  }
  for (const id of session.joinedEventIds) {
    if (!session.desiredEventIds.has(id)) toLeave.push(id);
  }
  return { toJoin, toLeave };
}

export function noteSocketMessage(session, eventId) {
  session.lastSocketMessageAt = new Date().toISOString();
  if (session.state === LiveConnectionState.SUBSCRIBED) {
    session.state = LiveConnectionState.CONNECTED;
  }
  if (eventId) session.joinedEventIds.add(String(eventId));
}

/**
 * If joined but no messages for silentMs, treat as silent failure → REST fallback.
 */
export function isSilentSubscription(session, silentMs = 60_000, now = Date.now()) {
  if (session.joinedEventIds.size === 0) return false;
  if (!session.lastSocketMessageAt) {
    return (
      session.lastRestSyncAt &&
      now - Date.parse(session.lastRestSyncAt) > silentMs
    );
  }
  return now - Date.parse(session.lastSocketMessageAt) > silentMs;
}
