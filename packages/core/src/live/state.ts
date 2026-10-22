/**
 * Canonical live overlay. These values are already past the provider adapter.
 * They are not an official result.
 */

export type LivePhase = "in_play" | "suspended" | "provisional_final";

/** Derived from phase. Eligibility is not a live flag. Not a break or match point. */
export type LiveFlag = "live" | "provisional";

export type ServingSide = "a" | "b";

/** Sets a player must win. 2 is a three-set match. 3 is a five-set match. */
export type SetsToWin = 2 | 3;

/**
 * Point flags derived from the score. `breakPoint` is the receiver one point
 * from the game. `matchPoint` is the side one point from the match.
 * Neither is a provider label, and neither is `LiveFlag`.
 */
export type LivePointFlags = {
  breakPoint: ServingSide | null;
  matchPoint: ServingSide | null;
};

/** Tennis game points. Not arithmetic. */
export type GamePoint = "0" | "15" | "30" | "40" | "AD";

/** One set as published game counts, such as `6-4`. */
export type CanonicalSet = `${string}-${string}`;

/** One game, such as `40-AD`. */
export type CanonicalGame = `${GamePoint}-${GamePoint}`;

/**
 * Current live projection for one match.
 * `sets` and `game` are canonical text. `flag` comes from `phase`.
 */
export type LiveMatchState = {
  matchId: string;
  tournamentId: string;
  publicRef: string;
  phase: LivePhase;
  sets: CanonicalSet | null;
  game: CanonicalGame | null;
  serving: ServingSide | null;
  flag: LiveFlag | null;
  provisionalWinner: string | null;
  occurredAt: string | null;
  receivedAt: string;
};

/** Plain fields the adapter has already pulled out of a provider payload. */
export type LiveStateDraft = {
  matchId: string;
  tournamentId: string;
  publicRef: string;
  phase: string;
  sets: string | null;
  game: string | null;
  serving: string | null;
  provisionalWinner: string | null;
  occurredAt: string | null;
  receivedAt: string;
};
