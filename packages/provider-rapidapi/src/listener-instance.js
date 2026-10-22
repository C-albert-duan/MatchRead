/**
 * Record which listener process posted.
 * A second recent id is an ops warning. It does not skip the batch or take a lock.
 */
import { listenerOverlap } from "./listener-overlap.js";

/**
 * @param {{ from: (table: string) => any }} admin
 * @param {string} instanceId
 * @param {string[]} log
 */
export async function noteListenerInstance(admin, instanceId, log) {
  if (!instanceId) return;
  try {
    const { data, error } = await admin
      .from("listener_health")
      .select("instance_id, updated_at")
      .eq("id", "sync-facts")
      .maybeSingle();
    if (error) {
      log.push(`listener instance unread: ${error.message}`);
      return;
    }
    const decision = listenerOverlap(
      {
        instanceId: data?.instance_id ?? null,
        seenAt: data?.updated_at ?? null,
      },
      instanceId,
      Date.now()
    );
    if (decision.warning) {
      log.push("listener overlap");
      const { error: opsError } = await admin.from("ops_events").insert(decision.warning);
      if (opsError) log.push(`listener overlap not recorded: ${opsError.message}`);
    }
    if (!decision.instanceId) return;
    const { error: writeError } = await admin.from("listener_health").upsert(
      {
        id: "sync-facts",
        transport: "rest",
        connection: "idle",
        instance_id: decision.instanceId,
      },
      { onConflict: "id" }
    );
    if (writeError) log.push(`listener instance: ${writeError.message}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.push(`listener instance: ${message}`);
  }
}
