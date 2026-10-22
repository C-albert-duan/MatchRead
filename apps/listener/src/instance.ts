/**
 * Identifies this process. It does not decide whether the process may run.
 */

export function listenerInstanceId(env: NodeJS.ProcessEnv, pid = process.pid): string {
  const replica = String(env.RAILWAY_REPLICA_ID ?? "").trim();
  if (replica) return replica;
  const host = String(env.HOSTNAME ?? "").trim() || "local";
  return `${host}:${pid}`;
}

/** Railway stays up only when the operator set a poll. There is no default interval. */
export function railwayPollError(env: NodeJS.ProcessEnv): string | null {
  const onRailway = Boolean(
    String(env.RAILWAY_SERVICE_ID ?? "").trim() || String(env.RAILWAY_PROJECT_ID ?? "").trim()
  );
  if (!onRailway) return null;
  const poll = Number(env.LISTENER_POLL_MS);
  if (Number.isFinite(poll) && poll > 0) return null;
  return "LISTENER_POLL_MS is required on Railway";
}
