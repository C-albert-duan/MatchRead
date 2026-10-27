import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CeilingTriad } from "@/components/me/CeilingTriad";
import { MatchRow } from "@/components/me/MatchRow";
import { MyMatchList } from "@/components/me/MyMatchList";
import { Stage } from "@/components/me/Stage";
import { LiveRerank } from "@/components/me/LiveRerank";
import { StageBeacon } from "@/components/me/StageBeacon";
import { ViewerClocks } from "@/components/me/ViewerClocks";
import { AppShell } from "@/components/shell/AppShell";
import { getSessionUser } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n";
import { liveMark } from "@/lib/me/live-rerank";
import { stageModel } from "@/lib/me/stage-policy";
import { publicPageMetadata } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import { signInNextHref } from "@/lib/tournaments/href";
import { viewMyTennis } from "@/server/use-cases/viewMyTennis";

export const dynamic = "force-dynamic";

export const metadata: Metadata = publicPageMetadata({
  title: "My Tennis | MatchRead",
  path: "/me",
});

/**
 * My Tennis: the Stage, the user's points, and their matches ordered by what
 * is at stake. Server first paint; the live layer only patches scores.
 */
export default async function MyTennisPage() {
  const user = await getSessionUser();
  if (!user) redirect(signInNextHref("/me"));

  const now = new Date();
  const locale = getLocale();
  const view = await viewMyTennis(createClient() as unknown as SupabaseClient, user.id, { now });
  const model = stageModel(view, now);
  const listed = view.rows.filter((row) => row.matters);
  const marks = Object.fromEntries(
    view.rows
      .filter((row) => row.status !== "final")
      .map((row) => [row.matchRef, liveMark(row.status === "live", row.live?.sets)])
  );
  const tournamentName =
    view.rows.find((row) => row.tournamentRef === model.triad?.tournamentRef)?.tournamentName ?? "";

  return (
    <AppShell signedIn email={user.email}>
      <ViewerClocks locale={locale} tba={t("match.timeTba")} tbc={t("calendar.dateTbc")}>
        <div className="page">
          <header className="page-header">
            <p className="eyebrow">{t("me.eyebrow")}</p>
            <h1 className="t-page-title">{t("me.title")}</h1>
            <p className="t-lead">{t("me.lede")}</p>
          </header>

          <Stage model={model} names={view.names} now={now} />
          <StageBeacon state={model.state} matchRef={model.focus?.matchRef ?? null} />
          <LiveRerank marks={marks} />

          {model.triad ? <CeilingTriad triad={model.triad} tournamentName={tournamentName} /> : null}

          {model.treatment !== "empty" ? (
            <section className="section stack gap-lg" aria-labelledby="my-matches">
              <h2 id="my-matches" className="section-title">
                {t("me.list.title")}
              </h2>
              {listed.length ? (
                <MyMatchList
                  label={t("me.list.title")}
                  items={listed.map((row) => ({
                    ref: row.matchRef,
                    node: <MatchRow row={row} names={view.names} />,
                  }))}
                />
              ) : (
                <p className="t-body">{t("me.list.empty")}</p>
              )}
            </section>
          ) : null}
        </div>
      </ViewerClocks>
    </AppShell>
  );
}
