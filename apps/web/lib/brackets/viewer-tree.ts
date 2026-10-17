import {
  buildRoundStructure,
  feederMatchKeys,
  feedsMatchKey,
  resolveMatchEntrants,
  type DrawSeat,
  type SlotOccupant,
} from "../../../../packages/core/src/bracket.ts";
import type { OfficialResults } from "../../../../packages/core/src/grade.ts";
import {
  matchSheetPresentation,
  officialWinnerRef,
  presentNodeSchedule,
  type MatchSheetState,
  type SeatSource,
} from "./resolution.ts";
import type {
  MatchPlayerSide,
  MatchScheduleRow,
  MatchSession,
} from "../tournaments/format.ts";

export type ViewerMatchNode = {
  key: string;
  round: number;
  indexInRound: number;
  column: string;
  matchLabel: string;
  feeds: string | null;
  feeders: [string, string] | null;
  a: SlotOccupant;
  b: SlotOccupant;
  aSource: SeatSource;
  bSource: SeatSource;
  state: MatchSheetState;
  score: string | null;
  winnerRef: string | null;
  voided: boolean;
  factKind: "played" | "withdrawal" | "void" | null;
  externalRef: string | null;
  scheduledAt: string | null;
  hasTime: boolean;
  session: MatchSession;
  court: string | null;
  timeTba: boolean;
};

function storedSeat(side: MatchPlayerSide | null | undefined): {
  occupant: SlotOccupant;
  source: SeatSource;
} {
  if (!side?.ref) return { occupant: { kind: "dash" }, source: "empty" };
  return {
    source: "stored",
    occupant: {
      kind: "player",
      ref: side.ref,
      lastName: side.lastName,
      seed: side.seed,
      countryCode: side.countryCode,
    },
  };
}

/**
 * Public tree nodes from seats and stored match rows.
 * Later-round seats are the stored sides. A child winner is not copied forward.
 */
export function buildViewerNodes(
  drawSize: number,
  seats: DrawSeat[],
  official: OfficialResults,
  schedule: Record<string, MatchScheduleRow>
): ViewerMatchNode[] {
  const rounds = buildRoundStructure(drawSize);
  const nodes: ViewerMatchNode[] = [];
  for (const round of rounds) {
    for (const match of round.matches) {
      const stored = schedule[match.key];
      const when = presentNodeSchedule(stored);
      const drawn =
        match.round === 0
          ? resolveMatchEntrants(seats, {}, match.round, match.indexInRound)
          : null;
      const sideA = drawn
        ? {
            occupant: drawn[0],
            source: (drawn[0].kind === "dash" ? "empty" : "draw") as SeatSource,
          }
        : storedSeat(stored?.side_a);
      const sideB = drawn
        ? {
            occupant: drawn[1],
            source: (drawn[1].kind === "dash" ? "empty" : "draw") as SeatSource,
          }
        : storedSeat(stored?.side_b);
      const sheet = matchSheetPresentation(official[match.key]);
      const result = official[match.key];
      nodes.push({
        key: match.key,
        round: match.round,
        indexInRound: match.indexInRound,
        column: round.label.column,
        matchLabel: round.label.match,
        feeds: feedsMatchKey(match.round, match.indexInRound, rounds.length),
        feeders: feederMatchKeys(match.round, match.indexInRound),
        a: sideA.occupant,
        b: sideB.occupant,
        aSource: sideA.source,
        bSource: sideB.source,
        state: sheet.state,
        score: sheet.showScore,
        winnerRef: officialWinnerRef(result, [
          sideA.occupant.kind === "player" ? sideA.occupant.ref : null,
          sideB.occupant.kind === "player" ? sideB.occupant.ref : null,
        ]),
        voided: Boolean(result?.voided),
        factKind: result?.factKind ?? null,
        externalRef: stored?.external_ref ?? null,
        scheduledAt: when.scheduledAt,
        hasTime: when.hasTime,
        session: when.session,
        court: when.court,
        timeTba: when.timeTba,
      });
    }
  }
  return nodes;
}
