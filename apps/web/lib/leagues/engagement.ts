import {
  biggestMiss,
  bracketHealth,
  countPerfectBrackets,
  leagueHighlights,
  perfectPicksRemaining,
  type BracketHealth,
  type BracketPicks,
  type BiggestMiss,
  type DrawSeat,
  type LeagueHighlight,
  type OfficialResults,
} from "@matchread/core";
import { memberLabel } from "@/lib/profiles/labels";

export type LeagueEngagement = {
  health: BracketHealth | null;
  perfectRemaining: number | null;
  perfectLeagueCount: number | null;
  biggestMiss: (BiggestMiss & { playerName?: string | null }) | null;
  highlights: Array<LeagueHighlight & { memberLabel: string; isYou: boolean }>;
};

export const EMPTY_ENGAGEMENT: LeagueEngagement = {
  health: null,
  perfectRemaining: null,
  perfectLeagueCount: null,
  biggestMiss: null,
  highlights: [],
};

type SnapRow = {
  user_id: string;
  score: number;
  max_score: number | null;
  upside: number | null;
  champion_alive: boolean | null;
  correct: number | null;
  incorrect: number | null;
  position_delta: number | null;
  previous_position: number | null;
  position: number | null;
};

/** Pure — no network. Build engagement from data already loaded for Daily Check. */
export function buildLeagueEngagement(input: {
  userId: string;
  drawSize: number;
  snaps: SnapRow[] | null | undefined;
  official: OfficialResults;
  seats: DrawSeat[];
  picks: BracketPicks;
  displayNames?: Record<string, string>;
}): LeagueEngagement {
  const { userId, drawSize, official, seats, picks } = input;
  const names = input.displayNames ?? {};
  const snaps = input.snaps ?? [];
  if (snaps.length === 0) return EMPTY_ENGAGEMENT;

  const mine = snaps.find((s) => s.user_id === userId) ?? null;
  const health = mine
    ? bracketHealth({
        score: mine.score,
        maxScore: mine.max_score ?? 0,
        upside: mine.upside ?? 0,
        championAlive: mine.champion_alive,
      })
    : null;

  const perfectLeagueCount = countPerfectBrackets(
    snaps.map((s) => ({ incorrect: s.incorrect ?? 0 }))
  );

  let perfectRemaining: number | null = null;
  let miss: (BiggestMiss & { playerName?: string | null }) | null = null;

  if (Object.keys(picks).length > 0) {
    perfectRemaining = perfectPicksRemaining({
      picks,
      official,
      drawSize,
      seats,
    });

    const rawMiss = biggestMiss({ picks, official, drawSize });
    if (rawMiss) {
      const seat = seats.find((s) => s.player_id === rawMiss.playerRef);
      miss = {
        ...rawMiss,
        playerName: seat?.last_name ?? rawMiss.playerRef,
      };
    }
  }

  const highlightRows = snaps.map((s) => {
    const positionDelta =
      s.position_delta != null
        ? s.position_delta
        : s.previous_position != null && s.position != null
          ? s.previous_position - s.position
          : null;
    return {
      userId: s.user_id,
      positionDelta,
      correct: s.correct ?? 0,
      incorrect: s.incorrect ?? 0,
    };
  });

  const highlights = leagueHighlights(highlightRows).map((h) => ({
    ...h,
    memberLabel: memberLabel(h.userId, userId, names),
    isYou: h.userId === userId,
  }));

  return {
    health,
    perfectRemaining,
    perfectLeagueCount,
    biggestMiss: miss,
    highlights,
  };
}
