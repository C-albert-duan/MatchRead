"use client";

import { useEffect } from "react";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

const LAST_STATE = "mr.stage.last";

/**
 * Records a Stage state change in stage_events (founder counter only).
 * A soft refresh that keeps the same state writes nothing. Telemetry never
 * blocks or breaks the page.
 */
export function StageBeacon({ state, matchRef }: { state: string; matchRef: string | null }) {
  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    let last: string | null = null;
    try {
      last = window.sessionStorage.getItem(LAST_STATE);
    } catch {
      last = null;
    }
    if (last === state) return;
    try {
      window.sessionStorage.setItem(LAST_STATE, state);
    } catch {
      // Private mode: write anyway; the counter tolerates repeats.
    }
    void createClient()
      .from("stage_events")
      .insert({ state, match_ref: matchRef })
      .then(() => undefined, () => undefined);
  }, [state, matchRef]);
  return null;
}
