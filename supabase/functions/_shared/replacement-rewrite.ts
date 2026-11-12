// Which brackets a pre-lock draw replacement may rewrite (fix list P1-2).
// Pure: no Deno or Supabase imports, so Node tests can load it.
//
// A replacement takes over the outgoing player's seat, so every pick naming
// the outgoing player, in every round, now means the incoming player. That
// holds for submitted brackets too: a submitted pick on a player who is no
// longer in the draw can never score. Only a lock stops the rewrite: the
// tournament's first ball (checked by the caller) or a commissioner's league
// lock (league_tournaments.locked_at), checked here.

export type RewriteBracket = { id: string; league_id: string | null };
export type LeagueLock = { league_id: string; locked_at: string | null };

/** Bracket ids whose league has not locked this tournament as of `now`. */
export function bracketsOpenForRewrite(
  brackets: readonly RewriteBracket[],
  leagueLocks: readonly LeagueLock[],
  now: number = Date.now()
): string[] {
  const locked = new Set<string>();
  for (const lock of leagueLocks) {
    if (!lock.locked_at) continue;
    const at = Date.parse(lock.locked_at);
    if (Number.isFinite(at) && at <= now) locked.add(lock.league_id);
  }
  return brackets
    .filter((bracket) => !bracket.league_id || !locked.has(bracket.league_id))
    .map((bracket) => bracket.id);
}
