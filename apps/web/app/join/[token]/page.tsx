import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppShell } from "@/components/shell/AppShell";
import { JoinLeagueButton } from "@/components/league/JoinLeagueButton";
import { getSessionUser } from "@/lib/auth";
import { t, tf } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import type { InvitePreview } from "@/lib/leagues/types";

type Props = {
  params: { token: string };
};

export default async function JoinPage({ params }: Props) {
  const user = await getSessionUser();
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_invite_preview", {
    p_token: params.token,
  });

  const preview = (Array.isArray(data) ? data[0] : data) as
    | InvitePreview
    | null
    | undefined;

  if (error || !preview || preview.revoked) {
    return (
      <AppShell signedIn={Boolean(user)} email={user?.email}>
        <div className="page">
          <header className="page-header">
            <p className="eyebrow">{t("join.eyebrow")}</p>
            <h1 className="t-page-title">{t("join.invalid.title")}</h1>
            <p className="t-lead">
              {preview?.revoked
                ? t("join.invalid.revoked")
                : t("join.invalid.missing")}
            </p>
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
    const { data: membership } = await supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", preview.league_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membership) {
      redirect(`/leagues/${preview.league_slug}`);
    }

    const { error: joinError } = await supabase.rpc("join_league_with_token", {
      p_token: params.token,
    });

    if (!joinError) {
      revalidatePath("/leagues");
      revalidatePath(`/leagues/${preview.league_slug}`);
      redirect(`/leagues/${preview.league_slug}`);
    }

    return (
      <AppShell signedIn email={user.email}>
        <div className="page">
          <header className="page-header">
            <p className="eyebrow">{t("join.eyebrow")}</p>
            <h1 className="t-page-title">
              {tf("join.invited", { name: preview.league_name })}
            </h1>
            <p className="form-error" role="alert">
              {/revoked|invalid/i.test(joinError.message)
                ? t("join.invalid.title")
                : joinError.message || t("error.generic")}
            </p>
          </header>
          <JoinLeagueButton token={params.token} />
          <Link href="/leagues" className="act act--quiet">
            {t("join.backLeagues")}
          </Link>
        </div>
      </AppShell>
    );
  }

  const nextPath = `/join/${params.token}`;

  return (
    <AppShell signedIn={false}>
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">{t("join.eyebrow")}</p>
          <h1 className="t-page-title">
            {tf("join.invited", { name: preview.league_name })}
          </h1>
          <p className="t-lead">{t("join.lede")}</p>
        </header>

        <div className="panel stack gap-lg focus-band">
          <dl className="meta-grid">
            <div>
              <dt className="eyebrow">{t("join.format")}</dt>
              <dd className="t-body" style={{ color: "var(--mr-text-primary)" }}>
                {preview.format === "single"
                  ? t("league.format.single")
                  : t("league.format.season")}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{t("join.members")}</dt>
              <dd className="t-body" style={{ color: "var(--mr-text-primary)" }}>
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
