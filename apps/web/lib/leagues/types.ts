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

/** Labels must match `tournaments.name` from migration 0003. */
export const TOURNAMENT_OPTIONS = [
  {
    value: "US Open 2026",
    label: "US Open 2026 — fixture 16-draw (entry open)",
    ref: "uso-2026",
  },
  {
    value: "Wimbledon 2026",
    label: "Wimbledon 2026 — draw pending",
    ref: "wim-2026",
  },
  {
    value: "Roland Garros 2026",
    label: "Roland Garros 2026 — draw pending",
    ref: "rg-2026",
  },
] as const;
