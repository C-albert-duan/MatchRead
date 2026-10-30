/**
 * Single-event leagues cover one tournament row. Season leagues cover all,
 * unless the commissioner opted into a custom schedule (schedule_mode
 * 'custom'): then only the league_tournaments rows count.
 */

export type LeagueCoverage = {
  format?: string | null;
  schedule_mode?: string | null;
  tournament_id?: string | null;
  /** league_tournaments ids; read only for a custom schedule. */
  scheduled_ids?: ReadonlySet<string> | null;
};

export function isCustomSchedule(league: LeagueCoverage): boolean {
  return league.format === "season" && league.schedule_mode === "custom";
}

/** True when coverage is the league_tournaments rows, not every event. */
export function leagueUsesSchedule(league: LeagueCoverage): boolean {
  return league.format !== "season" || isCustomSchedule(league);
}

export function leagueIncludesTournament(
  league: LeagueCoverage,
  tournamentId: string
): boolean {
  if (isCustomSchedule(league)) {
    return Boolean(league.scheduled_ids?.has(tournamentId));
  }
  if (league.format === "season") return true;
  return Boolean(league.tournament_id) && league.tournament_id === tournamentId;
}
