/** Public tournament page. Calendar and landing rows use this — never a hand-built path. */
export function tournamentHref(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) return "/tournaments";
  return `/tournaments/${encodeURIComponent(trimmed)}`;
}

export function enterHref(ref: string): string {
  return `/enter/${encodeURIComponent(ref.trim())}`;
}

export function leagueNewHref(tournamentRef?: string): string {
  if (!tournamentRef?.trim()) return "/leagues/new";
  return `/leagues/new?tournament=${encodeURIComponent(tournamentRef.trim())}`;
}

export function signInNextHref(next: string): string {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}
