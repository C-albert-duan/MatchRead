/**
 * Live projection and official settlement do not share columns.
 * A failing assignment here is a type error in `npm run typecheck`.
 */

import type { LiveOnly } from "@matchread/core";

type LiveFields = {
  match_id: string;
  public_ref: string;
  phase: "in_play" | "suspended" | "provisional_final";
  score_text: string | null;
  points_text: string | null;
  serving_side: "a" | "b" | null;
  provisional_winner_ref: string | null;
  sequence: number;
  sequence_source: "seq" | "updatedAt" | "receivedAt";
};

export type LiveProjection = LiveOnly<LiveFields>;

export type OfficialSettlement = {
  winner_player_id: string | null;
  official_score: string | null;
  settled_at: string | null;
  voided: boolean;
  winner_side: "a" | "b" | null;
};

type ForbiddenLiveKey =
  | "winner_player_id"
  | "official_score"
  | "settled_at"
  | "voided"
  | "winner_side";

type LiveHasOfficialColumn = Extract<keyof LiveProjection, ForbiddenLiveKey>;

export const liveProjectionExcludesOfficial: LiveHasOfficialColumn extends never
  ? true
  : never = true;

export type LiveDecision = {
  officialPatch: null;
  advance: false;
};
