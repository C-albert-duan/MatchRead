import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorNote } from "@/components/shell/ErrorNote";
import { getSessionUser } from "@/lib/auth";
import {
  founderEmailsUnset,
  isFounderEmail,
} from "@/lib/auth/founder";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export default async function FounderPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=%2Ffounder");
  }

  if (!isFounderEmail(user.email ?? undefined)) {
    return (
      <AppShell signedIn email={user.email}>
        <div className="stack gap-lg">
          <p className="eyebrow">{t("founder.eyebrow")}</p>
          <h1 className="t-page-title">{t("founder.title")}</h1>
          <ErrorNote>{t("founder.denied")}</ErrorNote>
        </div>
      </AppShell>
    );
  }

  const supabase = createClient();

  const [
    leaguesRes,
    membersRes,
    submittedRes,
    snapshotsRes,
    resultsRes,
    lastSnapRes,
    opsRes,
  ] = await Promise.all([
    supabase.from("leagues").select("*", { count: "exact", head: true }),
    supabase.from("league_members").select("*", { count: "exact", head: true }),
    supabase
      .from("brackets")
      .select("*", { count: "exact", head: true })
      .not("submitted_at", "is", null),
    supabase
      .from("bracket_snapshots")
      .select("*", { count: "exact", head: true }),
    supabase.from("match_results").select("*", { count: "exact", head: true }),
    supabase
      .from("bracket_snapshots")
      .select("ranked_at")
      .order("ranked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ops_events")
      .select("id, created_at, kind, name, payload")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const loadError =
    leaguesRes.error ||
    membersRes.error ||
    submittedRes.error ||
    snapshotsRes.error ||
    resultsRes.error ||
    lastSnapRes.error ||
    opsRes.error;

  const fmt = (count: number | null | undefined, err: unknown) =>
    err || count == null ? "—" : String(count);

  const stats: { label: string; value: string }[] = [
    {
      label: t("founder.stat.leagues"),
      value: fmt(leaguesRes.count, leaguesRes.error),
    },
    {
      label: t("founder.stat.members"),
      value: fmt(membersRes.count, membersRes.error),
    },
    {
      label: t("founder.stat.submitted"),
      value: fmt(submittedRes.count, submittedRes.error),
    },
    {
      label: t("founder.stat.snapshots"),
      value: fmt(snapshotsRes.count, snapshotsRes.error),
    },
    {
      label: t("founder.stat.results"),
      value: fmt(resultsRes.count, resultsRes.error),
    },
    {
      label: t("founder.stat.lastRanked"),
      value: lastSnapRes.data?.ranked_at
        ? new Date(lastSnapRes.data.ranked_at).toISOString()
        : t("founder.stat.none"),
    },
  ];

  return (
    <AppShell signedIn email={user.email}>
      <div className="stack gap-2xl">
        {founderEmailsUnset() ? (
          <div className="status-banner status-banner--beta" role="status">
            {t("founder.beta")}
          </div>
        ) : null}

        <div className="stack gap-lg">
          <p className="eyebrow">{t("founder.eyebrow")}</p>
          <h1 className="t-page-title">{t("founder.title")}</h1>
          <p className="t-lead">{t("founder.lede")}</p>
        </div>

        {loadError ? (
          <ErrorNote>
            {t("error.generic")}{" "}
            <span className="t-caption">
              {typeof loadError === "object" &&
              loadError &&
              "message" in loadError
                ? String((loadError as { message: string }).message)
                : "Count query failed (check RLS / migrations)."}
            </span>
          </ErrorNote>
        ) : null}

        <dl className="health-grid">
          {stats.map((s) => (
            <div key={s.label} className="health-cell">
              <dt className="eyebrow">{s.label}</dt>
              <dd className="health-value numeral">{s.value}</dd>
            </div>
          ))}
        </dl>

        <section className="stack gap-md" aria-labelledby="ops-events">
          <h2 id="ops-events" className="section-title">
            {t("founder.ops.title")}
          </h2>
          {opsRes.data && opsRes.data.length > 0 ? (
            <ul className="stack gap-sm">
              {opsRes.data.map((row) => (
                <li key={row.id} className="t-body">
                  <span className="eyebrow">
                    {row.kind === "error"
                      ? t("founder.ops.kind.error")
                      : t("founder.ops.kind.event")}
                  </span>{" "}
                  <span className="numeral">
                    {new Date(row.created_at).toISOString()}
                  </span>{" "}
                  {row.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-body">{t("founder.ops.empty")}</p>
          )}
        </section>

        <p className="hint">{t("founder.note.noServiceRole")}</p>

        <div className="row wrap gap-md">
          <Link
            href="/founder/disruption"
            className="act act--prominent act--prominent-size"
          >
            {t("founder.link.disruption")}
          </Link>
          <Link href="/leagues" className="act act--standard act--standard-size">
            {t("nav.leagues")}
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
