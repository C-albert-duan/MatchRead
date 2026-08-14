/** Single-event leagues cover one tournament row. Season leagues cover all. */

export function leagueIncludesTournament(
  league: { format?: string | null; tournament_id?: string | null },
  tournamentId: string
): boolean {
  if (league.format === "season") return true;
  return Boolean(league.tournament_id) && league.tournament_id === tournamentId;
}
