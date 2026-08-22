"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    return { ok: false, error: "Sign in to fill a bracket." };
  }

  const ref = tournamentRef.trim();
  if (!ref) {
    return { ok: false, error: "Tournament not found." };
  }

  await supabase.rpc("ensure_profile");

  const { data: tournament, error: tErr } = await supabase
    .from("public_calendar")
    .select("id, slug")
    .eq("slug", ref)
    .maybeSingle();

  if (tErr || !tournament?.id) {
    return { ok: false, error: "Tournament not found." };
  }

  const { data, error } = await supabase.rpc("ensure_solo_league", {
    p_tournament_id: tournament.id,
  });

  if (error) {
    const msg = error.message ?? "";
    if (/tournament not found/i.test(msg)) {
      return { ok: false, error: "Tournament not found." };
    }
    return { ok: false, error: msg || "Could not start your bracket." };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const slug =
    row && typeof row === "object"
      ? ((row as { slug?: string }).slug ?? null)
      : null;

  if (!slug) {
    return { ok: false, error: "Could not start your bracket." };
  }

  revalidatePath("/leagues");
  redirect(`/leagues/${slug}/t/${tournament.slug}/bracket`);
}

export async function createLeague(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: "Sign in to create a league." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const format = String(formData.get("format") ?? "") as LeagueFormat;
  const visibility = String(
    formData.get("visibility") ?? "private"
  ) as LeagueVisibility;
  const tournamentLabel = String(formData.get("tournament_label") ?? "").trim();
  // Form still posts tournament_label; value is tournaments.slug.

  if (!name) {
    return { ok: false, error: "Give your league a name." };
  }
  if (format !== "single" && format !== "season") {
    return { ok: false, error: "Choose a format." };
  }
  if (visibility !== "private" && visibility !== "public") {
    return { ok: false, error: "Choose who can see it." };
  }
  if (format === "single" && !tournamentLabel) {
    return { ok: false, error: "Pick a tournament." };
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
      return { ok: false, error: "Pick a tournament." };
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
    return { ok: false, error: "Could not create the league." };
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
    return { ok: false, error: "Sign in to join." };
  }

  const { data: leagueRow, error } = await supabase.rpc("join_with_invite", {
    p_token: token,
  });

  if (error) {
    const msg = error.message ?? "";
    if (/revoked/i.test(msg)) {
      return { ok: false, error: "This invite is no longer valid." };
    }
    if (/invalid/i.test(msg)) {
      return { ok: false, error: "This invite is no longer valid." };
    }
    return { ok: false, error: msg || "Could not join." };
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
    return { ok: false, error: "Sign in required." };
  }

  const { error } = await supabase.rpc("reissue_invite", {
    p_league_id: leagueId,
  });

  if (error) {
    return {
      ok: false,
      error: mapLeagueRpcError(error.message, "Could not reissue invite."),
    };
  }

  revalidatePath(`/leagues/${slug}`);
  return { ok: true };
}

function mapLeagueRpcError(msg: string, fallback: string): string {
  if (/not authenticated/i.test(msg)) return "Sign in required.";
  if (/not commissioner/i.test(msg)) return "Only the commissioner can do that.";
  if (/invalid name/i.test(msg)) return "Give your league a name.";
  if (/invalid visibility/i.test(msg)) return "Choose who can see it.";
  if (/league not found/i.test(msg)) return "League not found.";
  if (/cannot kick self/i.test(msg)) return "You cannot remove yourself.";
  if (/cannot kick commissioner/i.test(msg))
    return "You cannot remove the commissioner.";
  if (/member not found/i.test(msg)) return "That member is not in this league.";
  if (/not a member/i.test(msg)) return "You are not in this league.";
  if (/commissioner cannot leave/i.test(msg))
    return "Commissioners must delete the league instead of leaving.";
  return msg || fallback;
}

export async function updateLeague(input: {
  leagueId: string;
  slug: string;
  name: string;
  visibility: LeagueVisibility;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Give your league a name." };
  }
  if (input.visibility !== "private" && input.visibility !== "public") {
    return { ok: false, error: "Choose who can see it." };
  }

  const { error } = await supabase.rpc("update_league", {
    p_league_id: input.leagueId,
    p_name: name,
    p_visibility: input.visibility,
  });

  if (error) {
    return {
      ok: false,
      error: mapLeagueRpcError(error.message, "Could not update league."),
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
    return { ok: false, error: "Sign in required." };
  }

  const { error } = await supabase.rpc("delete_league", {
    p_league_id: leagueId,
  });

  if (error) {
    return {
      ok: false,
      error: mapLeagueRpcError(error.message, "Could not delete league."),
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
    return { ok: false, error: "Sign in required." };
  }

  const { error } = await supabase.rpc("kick_league_member", {
    p_league_id: input.leagueId,
    p_user_id: input.userId,
  });

  if (error) {
    return {
      ok: false,
      error: mapLeagueRpcError(error.message, "Could not remove member."),
    };
  }

  revalidatePath(`/leagues/${input.slug}`);
  return { ok: true };
}

export async function leaveLeague(leagueId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { error } = await supabase.rpc("leave_league", {
    p_league_id: leagueId,
  });

  if (error) {
    return {
      ok: false,
      error: mapLeagueRpcError(error.message, "Could not leave league."),
    };
  }

  revalidatePath("/leagues");
  redirect("/leagues");
}
