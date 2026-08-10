export type LeagueFormat = "single" | "season";
export type LeagueVisibility = "private" | "public";
export type MemberRole = "commissioner" | "member";

export type League = {
  id: string;
  slug: string;
  name: string;
  format: LeagueFormat;
  visibility: LeagueVisibility;
  tournament_label: string | null;
  commissioner_id: string;
  created_at: string;
  /** True while this is still a personal league of one (solo funnel). */
  is_solo: boolean;
};

export type LeagueListItem = League & {
  member_count: number;
  role: MemberRole;
};

export type InvitePreview = {
  token: string;
  league_id: string;
  league_slug: string;
  league_name: string;
  format: LeagueFormat;
  visibility: LeagueVisibility;
  tournament_label: string | null;
  member_count: number;
  revoked: boolean;
};

/** Option for create-league select — loaded from `tournaments` at request time. */
export type TournamentOption = {
  value: string;
  label: string;
  ref: string;
};
