// Drop the live projection after an official settle has been written.
// A winner conflict records the difference and keeps the live row.
// A failed disagreement insert does not delete the row.
// A missing table does not fail the settle.
// REST stays the official fact. The live branch never writes matches.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { restLiveDifference } from "../../../packages/provider-rapidapi/src/live-frame.js";

export type OfficialLiveFact = {
  official_score?: string | null;
  winner_ref?: string | null;
  public_ref?: string | null;
};

type ClearResult = {
  ok: boolean;
  missing: boolean;
  error?: string;
  recordError?: string;
};

export async function clearProvisionalLive(
  admin: SupabaseClient,
  matchId: string,
  official: OfficialLiveFact = {},
  opts: { retain?: boolean } = {}
): Promise<ClearResult> {
  const { data, error: readError } = await admin
    .from("live_match_state")
    .select("public_ref,score_text,provisional_winner_ref")
    .eq("match_id", matchId)
    .maybeSingle();
  if (readError) {
    const missing = /live_match_state|does not exist|schema cache|Could not find the table/i.test(
      readError.message
    );
    return { ok: false, missing, error: readError.message };
  }

  if (data) {
    const row = restLiveDifference(
      {
        score: data.score_text,
        winner: data.provisional_winner_ref,
        public_ref: data.public_ref,
      },
      {
        score: official.official_score,
        winner: official.winner_ref,
        public_ref: official.public_ref,
      }
    );
    if (row) {
      const { error: opsError } = await admin.from("ops_events").insert(row);
      if (opsError) return { ok: false, missing: false, recordError: opsError.message };
    }
  }

  if (opts.retain) return { ok: true, missing: false };

  const { error } = await admin
    .from("live_match_state")
    .delete()
    .eq("match_id", matchId);
  if (!error) return { ok: true, missing: false };
  const missing = /live_match_state|does not exist|schema cache|Could not find the table/i.test(
    error.message
  );
  return { ok: false, missing, error: error.message };
}
