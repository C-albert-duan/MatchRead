// Retention for the live projection. Called from sync-facts.
// The scheduled caller is invoke_sync_facts on the existing sync-facts-5m job.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export async function sweepTerminalLive(
  admin: SupabaseClient,
  dryRun: boolean,
  log: string[]
): Promise<number | null> {
  if (dryRun) {
    log.push("live sweep skipped: dry run");
    return null;
  }
  const { data, error } = await admin.rpc("sweep_terminal_live_state");
  if (error) {
    const missing = /sweep_terminal_live_state|does not exist|schema cache|Could not find the function/i.test(
      error.message
    );
    log.push(
      missing
        ? "live sweep skipped: function missing"
        : `live sweep failed: ${error.message}`
    );
    return null;
  }
  const removed = typeof data === "number" ? data : Number(data ?? 0);
  log.push(`live sweep removed=${Number.isFinite(removed) ? removed : 0}`);
  return Number.isFinite(removed) ? removed : 0;
}
