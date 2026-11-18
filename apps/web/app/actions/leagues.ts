"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCustomScheduleEnabled } from "@/lib/env";
import { actionError, rpcErrorCode } from "@/lib/actions/errors";
import { createClient } from "@/lib/supabase/server";
import {
  parseLeagueSlug,
  parseScheduleChange,
  scheduleErrorCode,
  scheduleStatusFrom,
  type ScheduleResult,
} from "@/lib/leagues/schedule-change";
import type { LeagueFormat, LeagueVisibility } from "@/lib/leagues/types";
import { reportError } from "@/lib/report-error";
import { trackServer } from "@/lib/telemetry-server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

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

/**
 * Find or create a personal (is_solo) league for a tournament, then open the bracket.
 */
export async function ensureSoloLeague(tournamentRef: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: actionError("sign_in_bracket") };
  }

  const ref = tournamentRef.trim();
  if (!ref) {
    return { ok: false, error: actionError("tournament_not_found") };
  }

  await supabase.rpc("ensure_profile");

  const { data: tournament, error: tErr } = await supabase
    .from("public_calendar")
    .select("id, slug")
    .eq("slug", ref)
    .maybeSingle();

  if (tErr || !tournament?.id) {
    return { ok: false, error: actionError("tournament_not_found") };
  }

  const { data, error } = await supabase.rpc("ensure_solo_league", {
    p_tournament_id: tournament.id,
  });

  if (error) {
    const code = rpcErrorCode(error, "bracket_start_failed");
    if (code === "bracket_start_failed") reportError(error, { source: "solo_league" });
    return { ok: false, error: actionError(code) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const slug =
    row && typeof row === "object"
      ? ((row as { slug?: string }).slug ?? null)
      : null;

  if (!slug) {
    return { ok: false, error: actionError("bracket_start_failed") };
  }

  revalidatePath("/leagues");
  redirect(`/leagues/${slug}/t/${tournament.slug}/bracket`);
}

export async function createLeague(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: actionError("sign_in_create") };
  }

  const name = String(formData.get("name") ?? "").trim();
  const format = String(formData.get("format") ?? "") as LeagueFormat;
  const visibility = String(
    formData.get("visibility") ?? "private"
  ) as LeagueVisibility;
  const tournamentLabel = String(formData.get("tournament_label") ?? "").trim();
  // Form still posts tournament_label; value is tournaments.slug.

  if (!name) {
    return { ok: false, error: actionError("league_name_required") };
  }
  if (format !== "single" && format !== "season") {
    return { ok: false, error: actionError("format_required") };
  }
  if (visibility !== "private" && visibility !== "public") {
    return { ok: false, error: actionError("visibility_required") };
  }
  if (format === "single" && !tournamentLabel) {
    return { ok: false, error: actionError("tournament_required") };
  }

  await supabase.rpc("ensure_profile");

  let tournamentId: string | null = null;
  if (format === "single") {
    const { data: t } = await supabase
      .from("public_calendar")
      .select("id")
      .eq("slug", tournamentLabel)
      .maybeSingle();
    if (!t?.id) {
      return { ok: false, error: actionError("tournament_required") };
    }
    tournamentId = t.id;
  }

  const { data: created, error: createError } = await supabase.rpc(
    "create_league",
    {
      p_name: name,
      p_format: format,
      p_tournament_id: tournamentId,
      p_visibility: visibility,
      p_is_solo: false,
    }
  );

  if (createError) {
    reportError(createError, { source: "league_created" });
    return { ok: false, error: createError.message };
  }

  const row = Array.isArray(created) ? created[0] : created;
  const createdSlug =
    row && typeof row === "object"
      ? ((row as { league_slug?: string; slug?: string }).league_slug ??
        (row as { slug?: string }).slug)
      : null;

  if (!createdSlug) {
    return { ok: false, error: actionError("league_create_failed") };
  }

  trackServer("league_created", user.id, { slug: createdSlug });
  revalidatePath("/leagues");
  redirect(`/leagues/${createdSlug}?invite=1`);
}

export async function joinLeagueWithToken(
  token: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: actionError("sign_in_join") };
  }

  const { data: leagueRow, error } = await supabase.rpc("join_with_invite", {
    p_token: token,
  });

  if (error) {
    const code = rpcErrorCode(error, "join_failed");
    if (code === "join_failed") reportError(error, { source: "league_join" });
    return { ok: false, error: actionError(code) };
  }

  trackServer("league_joined", user.id, { token: token.slice(0, 8) });

  const joined = Array.isArray(leagueRow) ? leagueRow[0] : leagueRow;
  const joinedSlug =
    joined && typeof joined === "object"
      ? ((joined as { slug?: string }).slug ?? null)
      : null;

  revalidatePath("/leagues");
  if (joinedSlug) {
    redirect(`/leagues/${joinedSlug}`);
  }
  redirect("/leagues");
}

export async function revokeAndReissueInvite(
  leagueId: string,
  slug: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: actionError("sign_in") };
  }

  const { error } = await supabase.rpc("reissue_invite", {
    p_league_id: leagueId,
  });

  if (error) {
    return {
      ok: false,
      error: actionError(rpcErrorCode(error, "reissue_failed")),
    };
  }

  revalidatePath(`/leagues/${slug}`);
  return { ok: true };
}

export async function updateLeague(input: {
  leagueId: string;
  slug: string;
  name: string;
  visibility: LeagueVisibility;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: actionError("sign_in") };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: actionError("league_name_required") };
  }
  if (input.visibility !== "private" && input.visibility !== "public") {
    return { ok: false, error: actionError("visibility_required") };
  }

  const { error } = await supabase.rpc("update_league", {
    p_league_id: input.leagueId,
    p_name: name,
    p_visibility: input.visibility,
  });

  if (error) {
    return {
      ok: false,
      error: actionError(rpcErrorCode(error, "update_failed")),
    };
  }

  revalidatePath(`/leagues/${input.slug}`);
  revalidatePath("/leagues");
  return { ok: true };
}

export async function deleteLeague(
  leagueId: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: actionError("sign_in") };
  }

  const { error } = await supabase.rpc("delete_league", {
    p_league_id: leagueId,
  });

  if (error) {
    return {
      ok: false,
      error: actionError(rpcErrorCode(error, "delete_failed")),
    };
  }

  revalidatePath("/leagues");
  redirect("/leagues");
}

export async function kickMember(input: {
  leagueId: string;
  slug: string;
  userId: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: actionError("sign_in") };
  }

  const { error } = await supabase.rpc("kick_league_member", {
    p_league_id: input.leagueId,
    p_user_id: input.userId,
  });

  if (error) {
    return {
      ok: false,
      error: actionError(rpcErrorCode(error, "kick_failed")),
    };
  }

  revalidatePath(`/leagues/${input.slug}`);
  return { ok: true };
}

/** RLS-scoped: a private league the caller is not in resolves to null. */
async function resolveLeagueId(
  supabase: ReturnType<typeof createClient>,
  slug: string
): Promise<string | null> {
  const { data } = await supabase
    .from("leagues")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function scheduleChange(
  raw: unknown,
  fn: "add_league_tournament" | "remove_league_tournament"
): Promise<ScheduleResult> {
  // The page hides the controls when the flag is off; the actions must
  // refuse too, since they can be called directly (fix list P1-5).
  if (!isCustomScheduleEnabled()) return { ok: false, code: "disabled" };
  const input = parseScheduleChange(raw);
  if (!input) return { ok: false, code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, code: "signed_out" };

  const [leagueId, { data: tournament }] = await Promise.all([
    resolveLeagueId(supabase, input.slug),
    supabase
      .from("public_calendar")
      .select("id")
      .eq("slug", input.tournamentRef)
      .maybeSingle(),
  ]);
  if (!leagueId || !tournament?.id) return { ok: false, code: "not_found" };

  const { data, error } = await supabase.rpc(fn, {
    p_league_id: leagueId,
    p_tournament_id: tournament.id,
  });
  if (error) return { ok: false, code: scheduleErrorCode(error) };
  const status = scheduleStatusFrom(data);
  if (!status) return { ok: false, code: "unknown" };

  trackServer(
    fn === "add_league_tournament"
      ? "schedule_tournament_added"
      : "schedule_tournament_removed",
    user.id,
    { slug: input.slug, ref: input.tournamentRef, status }
  );
  revalidatePath(`/leagues/${input.slug}`);
  revalidatePath(`/leagues/${input.slug}/season`);
  revalidatePath(`/leagues/${input.slug}/t/${input.tournamentRef}`);
  return { ok: true, status };
}

export async function addTournamentAction(raw: unknown): Promise<ScheduleResult> {
  return scheduleChange(raw, "add_league_tournament");
}

export async function removeTournamentAction(
  raw: unknown
): Promise<ScheduleResult> {
  return scheduleChange(raw, "remove_league_tournament");
}

/** One-way switch of a season league to a custom schedule. */
export async function enableCustomScheduleAction(
  raw: unknown
): Promise<ScheduleResult> {
  if (!isCustomScheduleEnabled()) return { ok: false, code: "disabled" };
  const slug = parseLeagueSlug(raw);
  if (!slug) return { ok: false, code: "invalid" };
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, code: "signed_out" };

  const leagueId = await resolveLeagueId(supabase, slug);
  if (!leagueId) return { ok: false, code: "not_found" };

  const { data, error } = await supabase.rpc("enable_custom_schedule", {
    p_league_id: leagueId,
  });
  if (error) return { ok: false, code: scheduleErrorCode(error) };
  const status = scheduleStatusFrom(data);
  if (!status) return { ok: false, code: "unknown" };

  trackServer("schedule_custom_enabled", user.id, { slug, status });
  revalidatePath(`/leagues/${slug}`);
  revalidatePath(`/leagues/${slug}/season`);
  return { ok: true, status };
}

export async function leaveLeague(leagueId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: actionError("sign_in") };
  }

  const { error } = await supabase.rpc("leave_league", {
    p_league_id: leagueId,
  });

  if (error) {
    return {
      ok: false,
      error: actionError(rpcErrorCode(error, "leave_failed")),
    };
  }

  revalidatePath("/leagues");
  redirect("/leagues");
}
