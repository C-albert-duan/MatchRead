import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorNote } from "@/components/shell/ErrorNote";
import { getSessionUser } from "@/lib/auth";
import { isFounderEmail } from "@/lib/auth/founder";
import {
  carriedMappingMisses,
  founderLiveHealth,
  hasFreshnessWarning,
  latestInstant,
  type HealthLevel,
} from "@/lib/founder/live-health";
import { founderStageHealth, stageRatesFrom } from "@/lib/founder/stage-health";
import { t, tf } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

function shownInstant(value: string | null) {
  if (!value) return t("founder.integrity.none");
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : t("founder.integrity.none");
}

function levelLabel(level: HealthLevel) {
  if (level === "error") return t("founder.ops.kind.error");
  if (level === "event") return t("founder.ops.kind.event");
  return null;
}

function countText(value: number | null) {
  return value == null ? t("founder.integrity.none") : String(value);
}

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
  const [reportsRes, runsRes, blockedRes, listenerRes, mapRes, playRes, suspendedRes, ingestedRes, carriedRes, disagreeRes, unmappedRes] =
    await Promise.all([
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
        "ingestion_gap",
        "unexplained_absence",
        "listener_overlap",
        "live_rest_disagreement",
        "unmapped_event",
      ])
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("listener_health")
      .select(
        "id, transport, connection, last_frame_at, last_heartbeat_at, last_error, events_received, mapped_count, unmapped_count, lag_ms, frames_applied, frames_duplicate, frames_ignored, frames_unmapped, frames_ambiguous, frames_disagreement, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase.from("event_map").select("status").limit(2000),
    supabase
      .from("live_match_state")
      .select("match_id", { count: "exact", head: true })
      .eq("phase", "in_play"),
    supabase
      .from("live_match_state")
      .select("match_id", { count: "exact", head: true })
      .eq("phase", "suspended"),
    supabase
      .from("live_match_state")
      .select("occurred_at")
      .not("occurred_at", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tournaments")
      .select("provider_id")
      .eq("ingestion_enabled", true),
    supabase
      .from("ops_events")
      .select("id", { count: "exact", head: true })
      .eq("name", "live_rest_disagreement"),
    supabase
      .from("ops_events")
      .select("payload")
      .eq("name", "unmapped_event")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Stage and latch tiles are read apart from the integrity load: a database
  // without migration 0045 shows "none" here instead of failing the page.
  const tileNow = Date.now();
  const [stageRes, conflictRes] = await Promise.all([
    supabase.rpc("stage_event_rates", {
      p_since: new Date(tileNow - 86_400_000).toISOString(),
    }),
    supabase
      .from("ops_events")
      .select("id", { count: "exact", head: true })
      .eq("name", "winner_conflict")
      .gte("created_at", new Date(tileNow - 7 * 86_400_000).toISOString()),
  ]);
  const stageHealth = founderStageHealth({
    rates: stageRes.error
      ? null
      : stageRatesFrom(Array.isArray(stageRes.data) ? stageRes.data[0] : stageRes.data),
    winnerConflicts: conflictRes.error ? null : conflictRes.count ?? 0,
  });
  const stageAlarm = stageHealth.stage ? levelLabel(stageHealth.stage.level) : null;
  const conflictAlarm = levelLabel(stageHealth.winnerConflicts.level);

  const loadError =
    reportsRes.error ||
    runsRes.error ||
    blockedRes.error ||
    listenerRes.error ||
    mapRes.error ||
    playRes.error ||
    suspendedRes.error ||
    ingestedRes.error ||
    carriedRes.error ||
    disagreeRes.error ||
    unmappedRes.error;
  const listener = (listenerRes.data ?? []).find((row) => row.id === "listener") ?? null;
  const health = founderLiveHealth({
    now: Date.now(),
    listener: {
      connection: listener?.connection ?? null,
      lastHeartbeatAt: listener?.last_heartbeat_at ?? null,
      lastProviderEventAt: latestInstant(
        listener?.last_frame_at ?? null,
        ingestedRes.data?.occurred_at ?? null
      ),
      eventsIn: listener?.events_received ?? null,
      mapped: listener?.mapped_count ?? null,
      unmapped: listener?.unmapped_count ?? null,
      lagMs: listener?.lag_ms ?? null,
    },
    activePlay: !playRes.error && (playRes.count ?? 0) > 0,
    expectedPlay:
      (!playRes.error && (playRes.count ?? 0) > 0) ||
      (!suspendedRes.error && (suspendedRes.count ?? 0) > 0),
    disagreements: disagreeRes.error ? 0 : (disagreeRes.count ?? 0),
    carriedUnmapped: unmappedRes.error
      ? 0
      : carriedMappingMisses(
          unmappedRes.data ?? [],
          new Set(
            (carriedRes.data ?? [])
              .map((row) => (row.provider_id == null ? "" : String(row.provider_id).trim()))
              .filter(Boolean)
          )
        ),
    drawFreshness: (reportsRes.data ?? []).some((row) => hasFreshnessWarning(row.warnings)),
  });
  const heartbeatAlarm = levelLabel(health.heartbeat.level);
  const providerAlarm = levelLabel(health.providerEvent.level);
  const unmappedAlarm = levelLabel(health.carriedUnmapped.level);
  const disagreementAlarm = levelLabel(health.disagreement.level);
  const mapping = { mapped: 0, not_found: 0, ambiguous: 0, stale: 0 };
  for (const row of mapRes.data ?? []) {
    if (row.status === "mapped") mapping.mapped += 1;
    else if (row.status === "not_found") mapping.not_found += 1;
    else if (row.status === "ambiguous") mapping.ambiguous += 1;
    else if (row.status === "stale") mapping.stale += 1;
  }

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

        <section className="stack gap-md" aria-labelledby="listener-health">
          <h2 id="listener-health" className="section-title">
            {t("founder.integrity.listener")}
          </h2>
          <p className="t-caption">{t("founder.integrity.socketHold")}</p>
          <dl className="health-grid">
            <div className="health-cell">
              <dt className="eyebrow">{t("founder.integrity.listener")}</dt>
              <dd className="health-value">
                {health.connected
                  ? t("founder.integrity.connected")
                  : t("founder.integrity.notConnected")}
              </dd>
              {listener?.transport ? (
                <dd className="t-caption numeral">{listener.transport}</dd>
              ) : null}
            </div>
            <div className="health-cell">
              <dt className="eyebrow">{t("founder.integrity.heartbeat")}</dt>
              <dd className="health-value numeral">{shownInstant(health.heartbeat.at)}</dd>
              {heartbeatAlarm ? <dd className="t-caption">{heartbeatAlarm}</dd> : null}
            </div>
            <div className="health-cell">
              <dt className="eyebrow">{t("founder.integrity.lastEvent")}</dt>
              <dd className="health-value numeral">{shownInstant(health.providerEvent.at)}</dd>
              {providerAlarm ? <dd className="t-caption">{providerAlarm}</dd> : null}
            </div>
            <div className="health-cell">
              <dt className="eyebrow">{t("founder.integrity.eventsIn")}</dt>
              <dd className="health-value numeral">{countText(health.mapping.eventsIn)}</dd>
            </div>
            <div className="health-cell">
              <dt className="eyebrow">{t("founder.integrity.mapped")}</dt>
              <dd className="health-value numeral">{countText(health.mapping.mapped)}</dd>
            </div>
            <div className="health-cell">
              <dt className="eyebrow">{t("founder.integrity.unmapped")}</dt>
              <dd className="health-value numeral">{countText(health.mapping.unmapped)}</dd>
            </div>
            <div className="health-cell">
              <dt className="eyebrow">{t("founder.integrity.carriedUnmapped")}</dt>
              <dd className="health-value numeral">{health.carriedUnmapped.count}</dd>
              {unmappedAlarm ? <dd className="t-caption">{unmappedAlarm}</dd> : null}
            </div>
            <div className="health-cell">
              <dt className="eyebrow">{t("founder.integrity.disagreement")}</dt>
              <dd className="health-value numeral">{health.disagreement.count}</dd>
              {disagreementAlarm ? <dd className="t-caption">{disagreementAlarm}</dd> : null}
              {disagreementAlarm ? (
                <dd className="t-caption">{t("founder.integrity.restWins")}</dd>
              ) : null}
            </div>
            <div className="health-cell">
              <dt className="eyebrow">{t("founder.integrity.stageRate")}</dt>
              <dd className="health-value numeral">{countText(stageHealth.stage?.events ?? null)}</dd>
              {stageHealth.stage ? (
                <dd className="t-caption numeral">
                  {tf("founder.integrity.stagePeak", { n: stageHealth.stage.maxPerUserHour })}
                </dd>
              ) : null}
              {stageAlarm ? <dd className="t-caption">{stageAlarm}</dd> : null}
            </div>
            <div className="health-cell">
              <dt className="eyebrow">{t("founder.integrity.winnerConflicts")}</dt>
              <dd className="health-value numeral">{countText(stageHealth.winnerConflicts.count)}</dd>
              {conflictAlarm ? <dd className="t-caption">{conflictAlarm}</dd> : null}
              {conflictAlarm ? (
                <dd className="t-caption">{t("founder.integrity.latchHolds")}</dd>
              ) : null}
            </div>
            {health.providerFreshness ? (
              <div className="health-cell">
                <dt className="eyebrow">{t("founder.integrity.providerFreshness")}</dt>
                <dd className="health-value numeral">
                  {health.providerFreshness.lagMs == null
                    ? t("founder.integrity.none")
                    : `${health.providerFreshness.lagMs} ms`}
                </dd>
                {health.providerFreshness.drawFreshness ? (
                  <dd className="t-caption">freshness</dd>
                ) : null}
              </div>
            ) : null}
          </dl>
          {listenerRes.data && listenerRes.data.length > 0 ? (
            <ul className="stack gap-sm">
              {listenerRes.data.map((row) => (
                <li key={row.id} className="t-body">
                  <span className="eyebrow">{row.connection}</span>{" "}
                  <span className="numeral">{row.transport}</span>
                  {" · "}
                  applied {row.frames_applied}
                  {" · "}
                  duplicate {row.frames_duplicate}
                  {" · "}
                  ignored {row.frames_ignored}
                  {" · "}
                  unmapped {row.frames_unmapped}
                  {" · "}
                  ambiguous {row.frames_ambiguous}
                  {" · "}
                  disagreement {row.frames_disagreement ?? 0}
                  {row.last_frame_at ? (
                    <span className="t-caption">
                      {" "}
                      · {new Date(row.last_frame_at).toISOString()}
                    </span>
                  ) : null}
                  {row.last_error ? (
                    <span className="t-caption"> · {row.last_error}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-body">{t("founder.integrity.listenerEmpty")}</p>
          )}
        </section>

        <section className="stack gap-md" aria-labelledby="mapping-health">
          <h2 id="mapping-health" className="section-title">
            {t("founder.integrity.mapping")}
          </h2>
          {mapRes.data && mapRes.data.length > 0 ? (
            <p className="t-body numeral">
              mapped {mapping.mapped}
              {" · "}
              not found {mapping.not_found}
              {" · "}
              ambiguous {mapping.ambiguous}
              {" · "}
              stale {mapping.stale}
            </p>
          ) : (
            <p className="t-body">{t("founder.integrity.mappingEmpty")}</p>
          )}
        </section>

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
                const freshness = hasFreshnessWarning(row.warnings);
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
                    {freshness ? <span className="t-caption"> freshness</span> : null}
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
              {blockedRes.data.map((row) => {
                const payload =
                  row.payload &&
                  typeof row.payload === "object" &&
                  !Array.isArray(row.payload)
                    ? (row.payload as {
                        ref?: string;
                        public_ref?: string;
                        slug?: string;
                        tour?: string;
                        provider_tournament_id?: string;
                        provider_event_id?: string;
                        live_score?: string;
                        official_score?: string;
                        live_winner_ref?: string;
                        official_winner_ref?: string;
                      })
                    : null;
                const scores =
                  payload?.live_score || payload?.official_score
                    ? `${payload?.live_score ?? "—"} / ${payload?.official_score ?? "—"}`
                    : null;
                const winners =
                  payload?.live_winner_ref || payload?.official_winner_ref
                    ? `${payload?.live_winner_ref ?? "—"} / ${payload?.official_winner_ref ?? "—"}`
                    : null;
                const where = [
                  payload?.ref,
                  payload?.public_ref,
                  payload?.slug,
                  payload?.tour,
                  payload?.provider_tournament_id,
                  payload?.provider_event_id,
                  scores,
                  winners,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={row.id} className="t-body">
                    <span className="numeral">
                      {new Date(row.created_at).toISOString()}
                    </span>{" "}
                    {row.name}
                    {where ? <span className="t-caption"> {where}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="t-body">{t("founder.integrity.alertsEmpty")}</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
