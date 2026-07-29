"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugifyLeagueName } from "@/lib/leagues/slug";
import type { LeagueFormat, LeagueVisibility } from "@/lib/leagues/types";

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

  const slug = slugifyLeagueName(name);

  const { data: created, error: createError } = await supabase.rpc(
    "create_league",
    {
      p_name: name,
      p_slug: slug,
      p_format: format,
      p_visibility: visibility,
      p_tournament_label: format === "single" ? tournamentLabel : null,
    }
  );

  if (createError) {
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

  const { data: leagueId, error } = await supabase.rpc(
    "join_league_with_token",
    { p_token: token }
  );

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

  const { data: league } = await supabase
    .from("leagues")
    .select("slug")
    .eq("id", leagueId)
    .single();

  revalidatePath("/leagues");
  if (league?.slug) {
    redirect(`/leagues/${league.slug}`);
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

  const now = new Date().toISOString();

  const { error: revokeError } = await supabase
    .from("league_invites")
    .update({ revoked_at: now })
    .eq("league_id", leagueId)
    .is("revoked_at", null);

  if (revokeError) {
    return { ok: false, error: revokeError.message };
  }

  const { error: insertError } = await supabase.from("league_invites").insert({
    league_id: leagueId,
    created_by: user.id,
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  revalidatePath(`/leagues/${slug}`);
  return { ok: true };
}
