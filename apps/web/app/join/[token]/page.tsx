import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppShell } from "@/components/shell/AppShell";
import { TrackOnMount } from "@/components/shell/Telemetry";
import { JoinLeagueButton } from "@/components/league/JoinLeagueButton";
import { getSessionUser } from "@/lib/auth";
import { t, tf } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { trackServer } from "@/lib/telemetry-server";
import type { InvitePreview } from "@/lib/leagues/types";

type Props = {
  params: { token: string };
};

/** Best-effort preview — invites are commissioner-readable; may be null for guests. */
async function loadInvitePreview(
  supabase: ReturnType<typeof createClient>,
  token: string
): Promise<InvitePreview | null> {
  const { data: invite } = await supabase
    .from("invites")
    .select("token, league_id, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return null;

  const { data: league } = await supabase
    .from("leagues")
    .select("id, slug, name, format, visibility")
    .eq("id", invite.league_id)
    .maybeSingle();

  if (!league) {
    return {
      token: invite.token,
      league_id: invite.league_id,
      league_slug: "",
      league_name: "League",
      format: "single",
      visibility: "private",
      tournament_label: null,
      member_count: 0,
      revoked: Boolean(invite.revoked_at),
    };
  }

  const [{ count }, { data: lt }] = await Promise.all([
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("league_id", league.id),
    supabase
      .from("league_tournaments")
      .select("tournaments ( name )")
      .eq("league_id", league.id)
      .limit(1)
      .maybeSingle(),
  ]);

  const tour = lt
    ? Array.isArray(lt.tournaments)
      ? lt.tournaments[0]
      : lt.tournaments
    : null;

  return {
    token: invite.token,
    league_id: league.id,
    league_slug: league.slug,
    league_name: league.name,
    format: league.format,
    visibility: league.visibility,
    tournament_label: tour?.name ?? null,
    member_count: count ?? 0,
    revoked: Boolean(invite.revoked_at),
  };
}

export default async function JoinPage({ params }: Props) {
  const user = await getSessionUser();
  const supabase = createClient();
  const token = params.token.trim();
  if (!token) {
    redirect("/leagues");
  }

  const preview = await loadInvitePreview(supabase, token);

  if (preview?.revoked) {
    return (
      <AppShell signedIn={Boolean(user)} email={user?.email}>
        <div className="page">
          <header className="page-header">
            <p className="eyebrow">{t("join.eyebrow")}</p>
            <h1 className="t-page-title">{t("join.invalid.title")}</h1>
            <p className="t-lead">{t("join.invalid.revoked")}</p>
            <div className="page-actions">
              <Link href="/" className="act act--standard act--standard-size">
                {t("join.home")}
              </Link>
            </div>
          </header>
        </div>
      </AppShell>
    );
  }

  if (user) {
    if (preview?.league_slug) {
      const { data: membership } = await supabase
        .from("members")
        .select("user_id")
        .eq("league_id", preview.league_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membership) {
        redirect(`/leagues/${preview.league_slug}`);
      }
    }

    const { data: joined, error: joinError } = await supabase.rpc(
      "join_with_invite",
      { p_token: token }
    );

    if (!joinError) {
      const row = Array.isArray(joined) ? joined[0] : joined;
      const slug =
        row && typeof row === "object"
          ? ((row as { slug?: string }).slug ?? preview?.league_slug ?? null)
          : preview?.league_slug ?? null;
      trackServer("league_joined", user.id, {
        slug: slug ?? token.slice(0, 8),
      });
      revalidatePath("/leagues");
      if (slug) {
        revalidatePath(`/leagues/${slug}`);
        redirect(`/leagues/${slug}`);
      }
      redirect("/leagues");
    }

    return (
      <AppShell signedIn email={user.email}>
        <div className="page">
          <header className="page-header">
            <p className="eyebrow">{t("join.eyebrow")}</p>
            <h1 className="t-page-title">
              {preview
                ? tf("join.invited", { name: preview.league_name })
                : t("join.eyebrow")}
            </h1>
            <p className="form-error" role="alert">
              {/revoked|invalid/i.test(joinError.message)
                ? t("join.invalid.title")
                : joinError.message || t("error.generic")}
            </p>
          </header>
          <JoinLeagueButton token={token} />
          <Link href="/leagues" className="act act--quiet">
            {t("join.backLeagues")}
          </Link>
        </div>
      </AppShell>
    );
  }

  const nextPath = `/join/${token}`;
  const leagueName = preview?.league_name ?? null;

  return (
    <AppShell signedIn={false}>
      <TrackOnMount event="invite_opened" props={{ token: token.slice(0, 8) }} />
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">{t("join.eyebrow")}</p>
          <h1 className="t-page-title">
            {leagueName
              ? tf("join.invited", { name: leagueName })
              : t("join.eyebrow")}
          </h1>
          <p className="t-lead">{t("join.lede")}</p>
        </header>

        <div className="panel stack gap-lg focus-band">
          {preview ? (
            <dl className="meta-grid">
              <div>
                <dt className="eyebrow">{t("join.format")}</dt>
                <dd
                  className="t-body"
                  style={{ color: "var(--mr-text-primary)" }}
                >
                  {preview.format === "single"
                    ? t("league.format.single")
                    : t("league.format.season")}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{t("join.members")}</dt>
                <dd
                  className="t-body"
                  style={{ color: "var(--mr-text-primary)" }}
                >
                  {preview.member_count}
                </dd>
              </div>
              {preview.tournament_label ? (
                <div>
                  <dt className="eyebrow">{t("join.tournament")}</dt>
                  <dd
                    className="t-body"
                    style={{ color: "var(--mr-text-primary)" }}
                  >
                    {preview.tournament_label}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <Link
            href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
            className="act act--prominent act--prominent-size"
          >
            {t("join.signIn")}
          </Link>
          <p className="hint">{t("join.afterLink")}</p>
        </div>
      </div>
    </AppShell>
  );
}
