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
  matchKey,
  resolveMatchEntrants,
  roundLabel,
  totalMatches,
} from "./bracket";
export type {
  BracketPicks,
  DrawSeat,
  MatchRef,
  RoundLabel,
  RoundStructure,
  SlotOccupant,
} from "./bracket";

export {
  computeAlive,
  expectedPickCount,
  gradeBracket,
  maxBracketScore,
  rankRows,
  roundWeight,
  seasonPoints,
} from "./grade";
export type {
  BracketGrade,
  OfficialMatch,
  OfficialResults,
} from "./grade";

export { computeDailyCheck, ordinal } from "./pulse";
export type {
  DailyCheck,
  PulseAction,
  PulseBeat,
  PulseEmotion,
  PulseInput,
  PulseKind,
  StandingPulseRow,
} from "./pulse";

export const BRACKET_HEALTH = [
  "Elite",
  "Surviving",
  "Hanging On",
  "In Trouble",
] as const;

export type BracketHealth = (typeof BRACKET_HEALTH)[number];
