import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppShell } from "@/components/shell/AppShell";
import { JoinLeagueButton } from "@/components/league/JoinLeagueButton";
import { getSessionUser } from "@/lib/auth";
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
            <p className="eyebrow">Invite</p>
            <h1 className="t-page-title">This invite is no longer valid</h1>
            <p className="t-lead">
              {preview?.revoked
                ? "The commissioner revoked this link. Ask them for a fresh one."
                : "The link may have been replaced, or it never existed."}
            </p>
            <div className="page-actions">
              <Link href="/" className="act act--standard act--standard-size">
                Go to MatchRead
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
            <p className="eyebrow">Invite</p>
            <h1 className="t-page-title">
              You&apos;re invited to {preview.league_name}
            </h1>
            <p className="form-error" role="alert">
              {/revoked|invalid/i.test(joinError.message)
                ? "This invite is no longer valid."
                : joinError.message || "Could not join automatically."}
            </p>
          </header>
          <JoinLeagueButton token={params.token} />
          <Link href="/leagues" className="act act--quiet">
            Back to my leagues
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
          <p className="eyebrow">Invite</p>
          <h1 className="t-page-title">
            You&apos;re invited to {preview.league_name}
          </h1>
          <p className="t-lead">
            Brackets open when the draw lands. Join now so you&apos;re in the
            group when it does.
          </p>
        </header>

        <div className="panel stack gap-lg focus-band">
          <dl className="meta-grid">
            <div>
              <dt className="eyebrow">Format</dt>
              <dd className="t-body" style={{ color: "var(--mr-text-primary)" }}>
                {preview.format === "single"
                  ? "Single tournament"
                  : "Season league"}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Members</dt>
              <dd className="t-body" style={{ color: "var(--mr-text-primary)" }}>
                {preview.member_count}
              </dd>
            </div>
            {preview.tournament_label ? (
              <div>
                <dt className="eyebrow">Tournament</dt>
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
            Sign in and join
          </Link>
          <p className="hint">
            After the magic link, you&apos;ll land in the league automatically.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
