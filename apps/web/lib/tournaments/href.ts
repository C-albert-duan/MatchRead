const MATCH_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARE_ID = /^\d+$/;

/** Public match token. A uuid or a bare numeric id is not a public ref. */
export function isPublicMatchRef(ref: string | null | undefined): boolean {
  const value = ref?.trim() ?? "";
  if (!value || MATCH_UUID.test(value) || BARE_ID.test(value)) return false;
  return true;
}

/** Public match page. The argument is `matches.external_ref`, never the row uuid or a bare id. */
export function matchHref(externalRef: string | null | undefined): string | null {
  const ref = externalRef?.trim() ?? "";
  if (!isPublicMatchRef(ref)) return null;
  return `/matches/${encodeURIComponent(ref)}`;
}

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
