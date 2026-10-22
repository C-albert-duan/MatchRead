import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getSessionUser } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n";
import { respondMatchRoute, type MatchDetailLabels } from "@/lib/brackets/match-detail";
import { loadPublicMatch } from "@/lib/brackets/read-model";
import { publicPageMetadata } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import { matchHref } from "@/lib/tournaments/href";

export const dynamic = "force-dynamic";

type Props = {
  params: { ref: string };
};

function sideLabel(name: string | null): string {
  return name?.trim() || "—";
}

function detailLabels(): MatchDetailLabels {
  return {
    locale: getLocale(),
    match: t("match.page.open"),
    official: t("result.official"),
    scheduled: t("match.scheduled"),
    voided: t("match.voided"),
    winner: t("match.page.winner"),
    withdrawal: t("match.withdrawal"),
    tba: t("match.timeTba"),
    tbc: t("calendar.dateTbc"),
    day: t("match.session.day"),
    night: t("match.session.night"),
    notFoundTitle: t("match.notFound.title"),
    notFoundBody: t("match.notFound.body"),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ref = decodeURIComponent(params.ref).trim();
  const match = await loadPublicMatch(createClient(), ref);
  if (!match) return publicPageMetadata({ title: "MatchRead", path: "/" });
  const path = matchHref(match.external_ref) ?? "/";
  const title = `${sideLabel(match.side_a_last_name)} ${t("results.vs")} ${sideLabel(match.side_b_last_name)}`;
  return publicPageMetadata({
    title: `${title} | MatchRead`,
    description: `${title} at ${match.tournament_name}.`,
    path,
  });
}

export default async function PublicMatchPage({ params }: Props) {
  const result = await respondMatchRoute(params.ref, createClient(), detailLabels());
  if (result.status === 404) notFound();

  const user = await getSessionUser();
  const detail = result.detail;

  return (
    <AppShell signedIn={Boolean(user)} email={user?.email}>
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">{detail.round}</p>
          <h1 className="t-page-title">
            {detail.sideA}
            <span className="t-lead"> {t("results.vs")} </span>
            {detail.sideB}
          </h1>
        </header>
        <section
          className="panel stack gap-md"
          aria-labelledby="match-detail"
          data-public-ref={detail.publicRef}
          data-tournament-id={detail.tournamentId}
          data-tournament-ref={detail.tournamentRef}
          data-resolution={detail.sheetState}
          data-base-resolution={detail.sheetState}
          data-settled={detail.sheetState === "official" ? "true" : undefined}
        >
          <h2 id="match-detail" className="t-caption">
            {detail.state}
          </h2>
          <p className="match-live" data-live-root hidden />
          <p className="t-lead numeral">{detail.lead}</p>
          {detail.winner ? (
            <p className="t-body">
              {t("match.page.winner")}
              {" · "}
              <span className="numeral">{detail.winner}</span>
            </p>
          ) : null}
          {detail.withdrawal ? (
            <p className="t-caption">{t("match.withdrawal")}</p>
          ) : null}
          {detail.session ? <p className="t-body">{detail.session}</p> : null}
          {detail.court ? <p className="t-body">{detail.court}</p> : null}
          <p className="t-caption">{t("common.tournament")}</p>
          <Link href={detail.tournamentHref} className="act act--quiet">
            {detail.tournamentName}
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
