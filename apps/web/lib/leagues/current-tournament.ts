/**
 * Which of a league's tournaments the league home leads with (fix list P2-7).
 * It used to be whichever row the database returned first, often a finished
 * event. Order: in progress today, then the next to start, then the most
 * recently finished.
 */
export type ScheduledTournament = {
  tournament_id: string;
  starts_on: string | null;
  ends_on: string | null;
};

/** `today` is a YYYY-MM-DD date. */
export function pickCurrentTournament(
  rows: readonly ScheduledTournament[],
  today: string
): string | null {
  const dated = rows.filter((row) => row.starts_on);
  const live = dated
    .filter((row) => row.starts_on! <= today && (row.ends_on ?? row.starts_on!) >= today)
    .sort((a, b) => a.starts_on!.localeCompare(b.starts_on!));
  if (live.length) return live[0].tournament_id;
  const upcoming = dated
    .filter((row) => row.starts_on! > today)
    .sort((a, b) => a.starts_on!.localeCompare(b.starts_on!));
  if (upcoming.length) return upcoming[0].tournament_id;
  const past = dated.sort((a, b) =>
    (b.ends_on ?? b.starts_on!).localeCompare(a.ends_on ?? a.starts_on!)
  );
  if (past.length) return past[0].tournament_id;
  return rows[0]?.tournament_id ?? null;
}
