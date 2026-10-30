import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  isPersonalDailyCheck,
  isScheduleEditable,
  scheduleGroup,
  scheduleStatus,
  type ScheduleGroup,
} from "@matchread/core";
import {
  AddTournamentPicker,
  CustomScheduleSwitch,
  ScheduleRowMenu,
  type ScheduleCandidate,
} from "@/components/league/ScheduleControls";
import { AppShell } from "@/components/shell/AppShell";
import { DailyCheckPanel } from "@/components/league/DailyCheckPanel";
import { EngagementStrip } from "@/components/league/EngagementStrip";
import { InvitePanel } from "@/components/league/InvitePanel";
import { LeagueHighlights } from "@/components/league/LeagueHighlights";
import { LeagueMembersPanel } from "@/components/league/LeagueMembersPanel";
import { LeagueSettingsPanel } from "@/components/league/LeagueSettingsPanel";
import { TourLabel } from "@/components/tournaments/TourLabel";
import { getSessionUser } from "@/lib/auth";
import { getServerSiteUrl, isCustomScheduleEnabled } from "@/lib/env";
import { getLocale, t, tf } from "@/lib/i18n";
import { loadDailyCheck } from "@/lib/leagues/daily-check";
import { isSoloPresentation } from "@/lib/leagues/solo";
import type { LeagueVisibility } from "@/lib/leagues/types";
import {
  isCustomSchedule,
  leagueIncludesTournament,
} from "@/lib/leagues/covers";
import { loadDisplayNames, memberLabel } from "@/lib/profiles/labels";
import { redirectIfMissingDisplayName } from "@/lib/profiles/require-name";
import { createClient } from "@/lib/supabase/server";
import {
  calendarStatus,
  calendarStatusMessageKey,
  formatTournamentDate,
  listVerifiedDrawTournamentIds,
  normalizeTour,
  surfaceClass,
} from "@/lib/tournaments/calendar";
import { EntryLockWhen } from "@/components/tournaments/EntryLockWhen";
import { shouldShowEntryLock, timeLabels } from "@/lib/tournaments/when";

type Props = {
  params: { slug: string };
  searchParams: { invite?: string };
};

/** Badge on league home tournament list — not just “does a draw exist?”. */
function tournamentListStatus(input: {
  hasDraw: boolean;
  drawSize: number;
  decidedCount: number;
  settled: boolean;
  starts_on: string | null;
  lock_at: string | null;
  admin_locked_at?: string | null;
  league_locked_at?: string | null;
}): string {
  const cal = calendarStatus({
    hasDraw: input.hasDraw,
    starts_on: input.starts_on,
    lock_at: input.lock_at,
    admin_locked_at: input.admin_locked_at,
  });
  if (cal === "live" || cal === "drawPending") {
    return t(calendarStatusMessageKey(cal));
  }
  if (input.league_locked_at || cal === "locked") {
    return t("tournament.locked");
  }
  if (!input.hasDraw) return t("league.status.drawPending");
  const expected = Math.max(input.drawSize - 1, 0);
  if (expected > 0 && input.decidedCount >= expected) {
    return input.settled ? t("league.status.settled") : t("league.status.complete");
  }
  if (input.decidedCount > 0) return t("calendar.onCourt");
  return t("league.status.drawOpen");
}

export default async function LeagueHomePage({ params, searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/leagues/${params.slug}`)}`);
  }
  const locale = getLocale();

  const supabase = createClient();
  const { data: league, error } = await supabase
    .from("leagues")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  if (error || !league) {
    notFound();
  }

  const [membershipRes, membersRes, { data: linkedTournaments }] =
    await Promise.all([
      supabase
        .from("members")
        .select("role")
        .eq("league_id", league.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("members")
        .select("user_id, role, joined_at")
        .eq("league_id", league.id)
        .order("joined_at", { ascending: true }),
      supabase
        .from("league_tournaments")
        .select("tournament_id, tournaments ( name )")
        .eq("league_id", league.id),
    ]);

  if (!membershipRes.data) {
    notFound();
  }

  await redirectIfMissingDisplayName(
    supabase,
    user.id,
    `/leagues/${params.slug}`
  );

  const membership = membershipRes.data;
  const members = membersRes.data ?? [];
  const memberCount = members.length;
  const isCommissioner = membership.role === "commissioner";
  const solo = isSoloPresentation({
    is_solo: Boolean((league as { is_solo?: boolean }).is_solo),
    member_count: memberCount,
  });

  const primaryLt = linkedTournaments?.[0];
  const primaryTour = primaryLt
    ? Array.isArray(primaryLt.tournaments)
      ? primaryLt.tournaments[0]
      : primaryLt.tournaments
    : null;
  const leagueForCheck = {
    ...league,
    tournament_id: primaryLt?.tournament_id ?? null,
    tournament_label: primaryTour?.name ?? null,
  };

  const memberNames = await loadDisplayNames(
    supabase,
    members.map((m) => m.user_id)
  );

  const [bundle, inviteRes, tournamentsRes, publishedIds] = await Promise.all([
    loadDailyCheck({
      supabase,
      league: leagueForCheck,
      userId: user.id,
      memberCount,
    }),
    isCommissioner
      ? supabase
          .from("invites")
          .select("token")
          .eq("league_id", league.id)
          .is("revoked_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as { token: string } | null }),
    supabase
      .from("tournaments")
      .select(
        "id, slug, name, surface, starts_on, ends_on, lock_at, venue_tz, draw_size, tour, published_at"
      )
      .order("starts_on", { ascending: true }),
    listVerifiedDrawTournamentIds(),
  ]);

  const { check, youSubmitted, engagement, tournament } = bundle;
  const showDailyCheck = isPersonalDailyCheck({
    youSubmitted,
    kind: check.kind,
  });

  let inviteUrl: string | null = null;
  if (inviteRes.data?.token) {
    inviteUrl = `${getServerSiteUrl()}/join/${inviteRes.data.token}`;
  }

  const openInvite = searchParams.invite === "1" && Boolean(inviteUrl);

  const customSchedule = isCustomSchedule(league);
  const scheduleEditing =
    isCommissioner && !solo && league.format === "season" && isCustomScheduleEnabled();

  const leagueTournaments = (tournamentsRes.data ?? [])
    .filter((row) =>
      leagueIncludesTournament(
        {
          format: league.format,
          schedule_mode: league.schedule_mode,
          tournament_id: leagueForCheck.tournament_id,
          scheduled_ids: new Set(
            (linkedTournaments ?? []).map((lt) => lt.tournament_id as string)
          ),
        },
        row.id
      )
    )
    .map((row) => ({ ...row, ref: row.slug }));

  const tournamentIds = leagueTournaments.map((t) => t.id);
  const [{ data: candidateRows }, { data: bracketRows }] =
    scheduleEditing && customSchedule
      ? await Promise.all([
          supabase.rpc("league_schedule_candidates", { p_league_id: league.id }),
          supabase.from("brackets").select("tournament_id").eq("league_id", league.id),
        ])
      : [{ data: null }, { data: null }];
  const tournamentsWithBrackets = new Set(
    ((bracketRows ?? []) as Array<{ tournament_id: string }>).map((b) => b.tournament_id)
  );
  const monthFormat = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const candidates: ScheduleCandidate[] = (
    (candidateRows ?? []) as Array<{
      slug: string;
      name: string;
      tour: string | null;
      surface: string | null;
      starts_on: string | null;
      ends_on: string | null;
    }>
  ).map((c) => ({
    ref: c.slug,
    name: c.name,
    tour: c.tour ?? "",
    surfaceClass: surfaceClass(c.surface),
    dateLabel: formatTournamentDate(c.starts_on, locale, c.ends_on) ?? t("calendar.dateTbc"),
    monthLabel: c.starts_on
      ? monthFormat.format(new Date(`${c.starts_on}T00:00:00Z`))
      : t("calendar.dateTbc"),
  }));

  const [{ data: resultRows }, { data: scoredRows }, { data: leagueLockRows }] =
    tournamentIds.length > 0
      ? await Promise.all([
          supabase
            .from("matches")
            .select("tournament_id, winner_player_id, voided")
            .in("tournament_id", tournamentIds),
          supabase
            .from("brackets")
            .select("tournament_id")
            .eq("league_id", league.id)
            .in("tournament_id", tournamentIds)
            .not("points", "is", null),
          supabase
            .from("league_tournaments")
            .select("tournament_id, locked_at")
            .eq("league_id", league.id)
            .in("tournament_id", tournamentIds),
        ])
      : [
          {
            data: [] as Array<{
              tournament_id: string;
              winner_player_id: string | null;
              voided: boolean;
            }>,
          },
          { data: [] as Array<{ tournament_id: string }> },
          {
            data: [] as Array<{ tournament_id: string; locked_at: string | null }>,
          },
        ];

  const leagueLockedAt = new Map(
    (leagueLockRows ?? [])
      .filter((row) => row.locked_at)
      .map((row) => [row.tournament_id, row.locked_at as string])
  );

  const decidedByTournament = new Map<string, number>();
  for (const row of resultRows ?? []) {
    if (row.voided || row.winner_player_id) {
      decidedByTournament.set(
        row.tournament_id,
        (decidedByTournament.get(row.tournament_id) ?? 0) + 1
      );
    }
  }
  const settledTournaments = new Set(
    (scoredRows ?? []).map((s) => s.tournament_id)
  );
  const dateTbc = t("calendar.dateTbc");
  const labels = timeLabels();

  type LeagueTournamentRow = (typeof leagueTournaments)[number];

  function rowScheduleStatus(row: LeagueTournamentRow) {
    const hasDraw = publishedIds.has(row.id);
    const expected = Math.max(row.draw_size - 1, 0);
    return scheduleStatus({
      hasDraw,
      drawAnnounced: Boolean(row.published_at || row.lock_at),
      lockAt: row.lock_at,
      leagueLockedAt: leagueLockedAt.get(row.id) ?? null,
      complete:
        settledTournaments.has(row.id) ||
        (expected > 0 && (decidedByTournament.get(row.id) ?? 0) >= expected),
    });
  }

  function renderTournament(row: LeagueTournamentRow) {
    const hasDraw = publishedIds.has(row.id);
    const status = tournamentListStatus({
      hasDraw,
      drawSize: row.draw_size,
      decidedCount: decidedByTournament.get(row.id) ?? 0,
      settled: settledTournaments.has(row.id),
      starts_on: row.starts_on,
      lock_at: row.lock_at,
      admin_locked_at: null,
      league_locked_at: leagueLockedAt.get(row.id) ?? null,
    });
    const start =
      formatTournamentDate(
        row.starts_on,
        locale,
        (row as { ends_on?: string | null }).ends_on
      ) ?? dateTbc;
    const lockAt =
      shouldShowEntryLock(row) && row.lock_at ? row.lock_at : null;
    const blockedBy = !isScheduleEditable(rowScheduleStatus(row))
      ? "locked"
      : tournamentsWithBrackets.has(row.id)
        ? "brackets"
        : null;
    return (
      <li key={row.id}>
        <Link
          href={`/leagues/${league.slug}/t/${row.ref}`}
          className="league-card"
        >
          <span
            className={`court-hairline court-${surfaceClass(row.surface)}`}
            aria-hidden
          />
          <TourLabel
            tour={normalizeTour((row as { tour?: string | null }).tour)}
          />
          <span className="stack gap-sm" style={{ flex: 1, minWidth: 0 }}>
            <span className="league-card-name">{row.name}</span>
            <span className="t-caption numeral">
              {start}
              {lockAt ? (
                <>
                  {" · "}
                  <EntryLockWhen
                    lockAt={lockAt}
                    venueTz={(row as { venue_tz?: string | null }).venue_tz}
                    locale={locale}
                    labels={labels}
                  />
                </>
              ) : null}
              {" · "}
              {`${row.draw_size}-draw`}
            </span>
          </span>
          <span className="league-card-status">{status}</span>
        </Link>
        {scheduleEditing && customSchedule ? (
          <ScheduleRowMenu
            slug={league.slug}
            tournamentRef={row.ref}
            name={row.name}
            leagueName={league.name}
            blockedBy={blockedBy}
          />
        ) : null}
      </li>
    );
  }

  const scheduleGroups: Array<[ScheduleGroup, LeagueTournamentRow[]]> = [
    ["upcoming", []],
    ["inPlay", []],
    ["completed", []],
  ];
  if (customSchedule) {
    for (const row of leagueTournaments) {
      const group = scheduleGroup(rowScheduleStatus(row));
      scheduleGroups.find(([g]) => g === group)?.[1].push(row);
    }
  }
  const groupTitle: Record<ScheduleGroup, string> = {
    upcoming: t("schedule.group.upcoming"),
    inPlay: t("schedule.group.inPlay"),
    completed: t("schedule.group.completed"),
  };

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">
              {solo ? t("league.solo.eyebrow") : t("league.eyebrow")}
            </p>
            <h1 className="t-page-title">
              {solo
                ? leagueForCheck.tournament_label ?? league.name
                : league.name}
            </h1>
            <p className="t-lead">
              {solo ? (
                t("leagues.solo.caption")
              ) : (
                <>
                  {league.format === "single"
                    ? leagueForCheck.tournament_label ?? t("league.format.single")
                    : t("league.format.season")}
                  {" · "}
                  {league.visibility}
                  {" · "}
                  {memberCount === 1
                    ? tf("leagues.members.count.one", { n: memberCount })
                    : tf("leagues.members.count", { n: memberCount })}
                </>
              )}
            </p>
          </div>
          <div className="page-actions">
            {tournament ? (
              <Link
                href={`/leagues/${league.slug}/t/${tournament.ref}${
                  tournament.has_draw ? "/bracket" : ""
                }`}
                className="act act--prominent act--prominent-size"
              >
                {tournament.has_draw
                  ? t("tournament.openBracket")
                  : t("league.drawPendingCta")}
              </Link>
            ) : null}
            {!solo ? (
              <Link
                href={`/leagues/${league.slug}/season`}
                className="act act--standard act--standard-size"
              >
                {t("league.seasonStandings")}
              </Link>
            ) : null}
            <Link href="/leagues" className="act act--quiet">
              {t("league.allLeagues")}
            </Link>
          </div>
        </header>

        {showDailyCheck ? <DailyCheckPanel check={check} /> : null}

        {showDailyCheck && engagement ? (
          <section className="section" aria-label="Engagement">
            <EngagementStrip
              health={engagement.health}
              perfectRemaining={engagement.perfectRemaining}
              perfectLeagueCount={engagement.perfectLeagueCount}
            />
          </section>
        ) : null}

        {showDailyCheck && engagement && !solo && engagement.highlights.length > 0 ? (
          <section className="section" aria-label="Highlights">
            <LeagueHighlights
              items={engagement.highlights.map((h) => ({
                label: h.label,
                memberLabel: h.memberLabel,
                isYou: h.isYou,
              }))}
            />
          </section>
        ) : null}

        {isCommissioner && inviteUrl ? (
          <section className="section" aria-labelledby="invite-heading">
            <h2 id="invite-heading" className="section-title">
              {solo ? t("league.grow.solo.title") : t("league.grow.title")}
            </h2>
            <p className="section-lede">
              {solo ? t("league.grow.solo.lede") : t("league.grow.lede")}
            </p>
            <InvitePanel
              leagueId={league.id}
              slug={league.slug}
              inviteUrl={inviteUrl}
              defaultOpen={
                openInvite ||
                Boolean((league as { is_solo?: boolean }).is_solo)
              }
            />
          </section>
        ) : null}

        <section className="section" aria-labelledby="tournaments-heading">
          <h2 id="tournaments-heading" className="section-title">
            {customSchedule ? t("schedule.title") : t("league.tournaments")}
          </h2>
          {customSchedule ? (
            <p className="section-lede">{t("schedule.customLede")}</p>
          ) : null}
          {scheduleEditing && !customSchedule ? (
            <CustomScheduleSwitch slug={league.slug} leagueName={league.name} />
          ) : null}
          {scheduleEditing && customSchedule ? (
            <div className="page-actions">
              <AddTournamentPicker slug={league.slug} candidates={candidates} />
            </div>
          ) : null}
          {leagueTournaments.length === 0 ? (
            <p className="t-body">
              {customSchedule ? t("schedule.none") : t("league.noTournaments")}
            </p>
          ) : customSchedule ? (
            scheduleGroups.map(([group, rows]) =>
              rows.length > 0 ? (
                <div key={group} className="stack gap-sm">
                  <h3 className="eyebrow eyebrow--plain">{groupTitle[group]}</h3>
                  <ul className="league-list">{rows.map(renderTournament)}</ul>
                </div>
              ) : null
            )
          ) : (
            <ul className="league-list">
              {leagueTournaments.map(renderTournament)}
            </ul>
          )}
        </section>

        {isCommissioner ? (
          <section className="section" aria-label={t("league.settings.title")}>
            <LeagueSettingsPanel
              leagueId={league.id}
              slug={league.slug}
              initialName={league.name}
              initialVisibility={league.visibility as LeagueVisibility}
            />
          </section>
        ) : null}

        <section className="section">
          <LeagueMembersPanel
            leagueId={league.id}
            slug={league.slug}
            currentUserId={user.id}
            isCommissioner={isCommissioner}
            members={members.map((m) => ({
              user_id: m.user_id,
              role: m.role,
              label: memberLabel(m.user_id, user.id, memberNames),
            }))}
          />
        </section>
      </div>
    </AppShell>
  );
}
