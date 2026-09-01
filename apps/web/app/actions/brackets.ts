"use server";

import { revalidatePath } from "next/cache";
import type { BracketConfidence, BracketPicks } from "@matchread/core";
import {
  confidenceToSavePayload,
  picksToSavePayload,
} from "@/lib/brackets/types";
import { reportError } from "@/lib/report-error";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, user: null as null };
  }
  return { supabase, user };
}

export async function saveBracketPicks(input: {
  leagueId: string;
  tournamentId: string;
  picks: BracketPicks;
  confidence?: BracketConfidence;
  leagueSlug: string;
  tournamentRef: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: "Sign in to save your bracket.", code: "auth" };
  }

  const payload = await picksToSavePayload(
    supabase,
    input.tournamentId,
    input.picks
  );
  const confidencePayload =
    input.confidence != null
      ? await confidenceToSavePayload(
          supabase,
          input.tournamentId,
          input.confidence
        )
      : null;

  const { error } = await supabase.rpc("save_picks", {
    p_league_id: input.leagueId,
    p_tournament_id: input.tournamentId,
    p_picks: payload,
    ...(confidencePayload != null ? { p_confidence: confidencePayload } : {}),
  });

  if (error) {
    const msg = error.message ?? "";
    if (/locked/i.test(msg)) {
      return {
        ok: false,
        error: "This draw has locked. Your bracket can no longer be changed.",
        code: "locked",
      };
    }
    return { ok: false, error: msg || "Your bracket did not save." };
  }

  revalidatePath(
    `/leagues/${input.leagueSlug}/t/${input.tournamentRef}/bracket`
  );
  revalidatePath(`/leagues/${input.leagueSlug}/t/${input.tournamentRef}`);
  return { ok: true };
}

export async function submitBracket(input: {
  leagueId: string;
  tournamentId: string;
  leagueSlug: string;
  tournamentRef: string;
  /** Latest editor picks — persisted before submit so autosave debounce cannot race. */
  picks: BracketPicks;
  confidence?: BracketConfidence;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: "Sign in to submit.", code: "auth" };
  }

  // Always write the sheet first. Submit alone used to fail with
  // "No bracket to submit" when the user finished and clicked Submit
  // before the 1.2s autosave timer had created the brackets row.
  const saved = await saveBracketPicks({
    leagueId: input.leagueId,
    tournamentId: input.tournamentId,
    picks: input.picks,
    confidence: input.confidence,
    leagueSlug: input.leagueSlug,
    tournamentRef: input.tournamentRef,
  });
  if (!saved.ok) return saved;

  const { error } = await supabase.rpc("submit_bracket", {
    p_league_id: input.leagueId,
    p_tournament_id: input.tournamentId,
  });

  if (error) {
    const msg = error.message ?? "";
    if (/locked/i.test(msg)) {
      return {
        ok: false,
        error: "This draw has locked. Entries are closed.",
        code: "locked",
      };
    }
    if (/incomplete/i.test(msg)) {
      return {
        ok: false,
        error: "Fill every match before submitting.",
        code: "incomplete",
      };
    }
    if (/no bracket/i.test(msg)) {
      return {
        ok: false,
        error: "Your picks did not save. Try Submit again.",
        code: "missing",
      };
    }
    reportError(error, { source: "bracket_submitted" });
    return { ok: false, error: msg || "Could not submit." };
  }

  revalidatePath(`/leagues/${input.leagueSlug}/t/${input.tournamentRef}`);
  revalidatePath(
    `/leagues/${input.leagueSlug}/t/${input.tournamentRef}/bracket`
  );
  return { ok: true };
}

export async function adminLockTournament(input: {
  tournamentRef: string;
  locked: boolean;
  leagueSlug: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: "Sign in required.", code: "auth" };
  }

  const { data: league } = await supabase
    .from("leagues")
    .select("id")
    .eq("slug", input.leagueSlug)
    .maybeSingle();
  const { data: tournament } = await supabase
    .from("public_calendar")
    .select("id")
    .eq("slug", input.tournamentRef)
    .maybeSingle();

  if (!league?.id || !tournament?.id) {
    return { ok: false, error: "League or tournament not found." };
  }

  if (!input.locked) {
    return {
      ok: false,
      error: "Unlock is not supported after a league lock.",
      code: "locked",
    };
  }

  const { error } = await supabase.rpc("lock_league_event", {
    p_league_id: league.id,
    p_tournament_id: tournament.id,
  });

  if (error) {
    const msg = error.message ?? "";
    if (/commissioner/i.test(msg)) {
      return { ok: false, error: "Only the commissioner can lock.", code: "role" };
    }
    return { ok: false, error: msg || "Could not update lock." };
  }

  revalidatePath(`/leagues/${input.leagueSlug}/t/${input.tournamentRef}`);
  revalidatePath(
    `/leagues/${input.leagueSlug}/t/${input.tournamentRef}/bracket`
  );
  return { ok: true };
}
