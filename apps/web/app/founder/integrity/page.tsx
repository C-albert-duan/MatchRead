import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorNote } from "@/components/shell/ErrorNote";
import { getSessionUser } from "@/lib/auth";
import { isFounderEmail } from "@/lib/auth/founder";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export default async function FounderIntegrityPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=%2Ffounder%2Fintegrity");
  }
  if (!isFounderEmail(user.email ?? undefined)) {
    return (
      <AppShell signedIn email={user.email}>
        <div className="stack gap-lg">
          <p className="eyebrow">{t("founder.eyebrow")}</p>
          <h1 className="t-page-title">{t("founder.integrity.title")}</h1>
          <ErrorNote>{t("founder.denied")}</ErrorNote>
        </div>
      </AppShell>
    );
  }

  const supabase = createClient();
  const [reportsRes, runsRes, blockedRes] = await Promise.all([
    supabase
      .from("draw_integrity_reports")
      .select(
        "tournament_id, checked_at, safe_to_publish, blocking, warnings, tournaments(slug, name, tier, bracket_eligible, product_override)"
      )
      .order("checked_at", { ascending: false })
      .limit(30),
    supabase
      .from("sync_repair_runs")
      .select("id, kind, tournament_id, started_at, finished_at, status, summary")
      .order("started_at", { ascending: false })
      .limit(25),
    supabase
      .from("ops_events")
      .select("id, created_at, kind, name, payload")
      .in("name", [
        "publish_blocked",
        "terminal_without_winner",
        "tier_unmapped",
        "draw_identity_reject",
      ])
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const loadError = reportsRes.error || runsRes.error || blockedRes.error;

  return (
    <AppShell signedIn email={user.email}>
      <div className="stack gap-2xl">
        <div className="stack gap-lg">
          <p className="eyebrow">{t("founder.eyebrow")}</p>
          <h1 className="t-page-title">{t("founder.integrity.title")}</h1>
          <p className="t-lead">{t("founder.integrity.lede")}</p>
          <p className="t-caption">{t("founder.integrity.killSwitch")}</p>
          <p>
            <Link href="/founder" className="text-link">
              {t("founder.integrity.back")}
            </Link>
          </p>
        </div>

        {loadError ? (
          <ErrorNote>
            {t("error.generic")}{" "}
            <span className="t-caption">
              {loadError.message || "Query failed"}
            </span>
          </ErrorNote>
        ) : null}

        <section className="stack gap-md" aria-labelledby="integrity-reports">
          <h2 id="integrity-reports" className="section-title">
            {t("founder.integrity.reports")}
          </h2>
          {reportsRes.data && reportsRes.data.length > 0 ? (
            <ul className="stack gap-sm">
              {reportsRes.data.map((row) => {
                const trow = Array.isArray(row.tournaments)
                  ? row.tournaments[0]
                  : row.tournaments;
                const blocking = Array.isArray(row.blocking)
                  ? row.blocking
                  : [];
                return (
                  <li key={row.tournament_id} className="t-body">
                    <span className="eyebrow">
                      {row.safe_to_publish
                        ? t("founder.integrity.safe")
                        : t("founder.integrity.blocked")}
                    </span>{" "}
                    <span className="numeral">
                      {trow?.slug ?? row.tournament_id}
                    </span>{" "}
                    {trow?.name} · tier={trow?.tier ?? "—"} · eligible=
                    {String(trow?.bracket_eligible)}
                    {blocking.length > 0 ? (
                      <span className="t-caption">
                        {" "}
                        — {blocking.map((b: { code?: string }) => b.code).join(", ")}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="t-body">{t("founder.integrity.reportsEmpty")}</p>
          )}
        </section>

        <section className="stack gap-md" aria-labelledby="repair-runs">
          <h2 id="repair-runs" className="section-title">
            {t("founder.integrity.repairs")}
          </h2>
          {runsRes.data && runsRes.data.length > 0 ? (
            <ul className="stack gap-sm">
              {runsRes.data.map((row) => (
                <li key={row.id} className="t-body">
                  <span className="eyebrow">{row.status}</span>{" "}
                  <span className="numeral">{row.id.slice(0, 8)}</span>{" "}
                  {row.kind} ·{" "}
                  {new Date(row.started_at).toISOString()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-body">{t("founder.integrity.repairsEmpty")}</p>
          )}
        </section>

        <section className="stack gap-md" aria-labelledby="integrity-ops">
          <h2 id="integrity-ops" className="section-title">
            {t("founder.integrity.alerts")}
          </h2>
          {blockedRes.data && blockedRes.data.length > 0 ? (
            <ul className="stack gap-sm">
              {blockedRes.data.map((row) => (
                <li key={row.id} className="t-body">
                  <span className="numeral">
                    {new Date(row.created_at).toISOString()}
                  </span>{" "}
                  {row.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-body">{t("founder.integrity.alertsEmpty")}</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
