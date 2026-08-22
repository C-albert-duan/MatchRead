/**
 * Domain package — zero runtime dependencies.
 * Scoring: weight doubles each round from 1; naming the champion
 * pays the final weight again. A 128-draw tops out at 512.
 */

export {
  applyByeAdvances,
  buildRoundStructure,
  countPicksMade,
  isBracketComplete,
  isFictionalSeatName,
  isFictionalSeatRef,
  isNamedPlayerSeat,
  isOfficialPublicDraw,
  isPublicDrawSeat,
  matchKey,
  resolveMatchEntrants,
  roundLabel,
  seatKind,
  totalMatches,
} from "./bracket";
export type {
  BracketPicks,
  DrawSeat,
  EntryStatus,
  MatchRef,
  RoundLabel,
  RoundStructure,
  SeatKind,
  SlotOccupant,
} from "./bracket";

export { isBracketProduct, PUBLIC_TIERS } from "./eligibility";
export type { PublicTier, TournamentTier } from "./eligibility";

export {
  assertLockIsSound,
  isLockUnsound,
  LockSoundnessError,
} from "./tournament/lock";
export type { LockFixture, LockTournament } from "./tournament/lock";

export {
  computeAlive,
  detailBracketGrade,
  expectedPickCount,
  gradeBracket,
  maxBracketScore,
  rankRows,
  roundWeight,
  seasonPoints,
} from "./grade";
export type {
  BracketGrade,
  BracketGradeDetail,
  ChampionBonusDetail,
  MatchGradeDetail,
  MatchGradeOutcome,
  OfficialMatch,
  OfficialResults,
} from "./grade";

export { computeDailyCheck, isPersonalDailyCheck, ordinal } from "./pulse";
export type {
  DailyCheck,
  PulseAction,
  PulseBeat,
  PulseEmotion,
  PulseInput,
  PulseKind,
  StandingPulseRow,
} from "./pulse";

export {
  BRACKET_HEALTH,
  biggestMiss,
  bracketHealth,
  clampConfidence,
  countPerfectBrackets,
  leagueHighlights,
  perfectPicksRemaining,
} from "./engagement";
export type {
  BiggestMiss,
  BracketConfidence,
  BracketHealth,
  HighlightLabel,
  HighlightRow,
  LeagueHighlight,
} from "./engagement";

export {
  SLAM_DRAW_SIZE,
  SLAM_MAX_SCORE,
  SLAM_ROUND_COUNT,
} from "./perf-notes";
