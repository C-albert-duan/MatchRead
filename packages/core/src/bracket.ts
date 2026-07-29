/**
 * Bracket topology — round labels from distance to the final,
 * match keys, and resolving entrants from seats + picks.
 */

export type RoundLabel = { column: string; match: string };

export function roundLabel(playersRemaining: number): RoundLabel {
  if (playersRemaining === 2) return { column: "Final", match: "Final" };
  if (playersRemaining === 4)
    return { column: "Semi-finals", match: "Semi-final" };
  if (playersRemaining === 8)
    return { column: "Quarter-finals", match: "Quarter-final" };
  return {
    column: `Round of ${playersRemaining}`,
    match: `Round of ${playersRemaining}`,
  };
}

export type MatchRef = {
  round: number;
  indexInRound: number;
  matchNumber: number;
  key: string;
};

export type RoundStructure = {
  index: number;
  playersRemaining: number;
  label: RoundLabel;
  matches: MatchRef[];
};

export function matchKey(round: number, indexInRound: number): string {
  return `r${round}-m${indexInRound}`;
}

export function buildRoundStructure(drawSize: number): RoundStructure[] {
  if (drawSize < 2 || (drawSize & (drawSize - 1)) !== 0) {
    throw new Error("drawSize must be a power of 2 >= 2");
  }
  const rounds: RoundStructure[] = [];
  let remaining = drawSize;
  let index = 0;
  let matchNumber = 1;
  while (remaining >= 2) {
    const count = remaining / 2;
    const matches: MatchRef[] = [];
    for (let m = 0; m < count; m++) {
      matches.push({
        round: index,
        indexInRound: m,
        matchNumber: matchNumber++,
        key: matchKey(index, m),
      });
    }
    rounds.push({
      index,
      playersRemaining: remaining,
      label: roundLabel(remaining),
      matches,
    });
    remaining /= 2;
    index++;
  }
  return rounds;
}

export function totalMatches(drawSize: number): number {
  return drawSize - 1;
}

export type DrawSeat = {
  position: number;
  player_ref: string;
  last_name: string;
  seed: number | null;
  country_code: string;
  is_bye: boolean;
};

/** A name that can appear in a slot — player, bye, dash, or unpicked. */
export type SlotOccupant =
  | {
      kind: "player";
      ref: string;
      lastName: string;
      seed: number | null;
      countryCode: string;
    }
  | { kind: "bye" }
  | { kind: "dash" }
  | { kind: "unpicked" };

export type BracketPicks = Record<string, string>;

function seatToOccupant(seat: DrawSeat | undefined): SlotOccupant {
  if (!seat) return { kind: "dash" };
  if (seat.is_bye) return { kind: "bye" };
  return {
    kind: "player",
    ref: seat.player_ref,
    lastName: seat.last_name,
    seed: seat.seed,
    countryCode: seat.country_code,
  };
}

function pickToOccupant(
  ref: string | undefined,
  seatsByRef: Map<string, DrawSeat>
): SlotOccupant {
  if (!ref) return { kind: "dash" };
  const seat = seatsByRef.get(ref);
  if (!seat) return { kind: "dash" };
  return seatToOccupant(seat);
}

/**
 * Resolve the two entrants for a match given R1 seats and prior picks.
 * Empty feeder → em dash. Known players with no pick yet stay as players
 * (the match itself is "unpicked").
 */
export function resolveMatchEntrants(
  seats: DrawSeat[],
  picks: BracketPicks,
  round: number,
  indexInRound: number
): [SlotOccupant, SlotOccupant] {
  const seatsByRef = new Map(seats.map((s) => [s.player_ref, s]));
  const byPos = new Map(seats.map((s) => [s.position, s]));

  if (round === 0) {
    return [
      seatToOccupant(byPos.get(indexInRound * 2)),
      seatToOccupant(byPos.get(indexInRound * 2 + 1)),
    ];
  }

  const feederA = matchKey(round - 1, indexInRound * 2);
  const feederB = matchKey(round - 1, indexInRound * 2 + 1);
  return [
    pickToOccupant(picks[feederA], seatsByRef),
    pickToOccupant(picks[feederB], seatsByRef),
  ];
}

/** Auto-advance when one side is a bye (the other player advances). */
export function applyByeAdvances(
  seats: DrawSeat[],
  picks: BracketPicks,
  drawSize: number
): BracketPicks {
  const next = { ...picks };
  const rounds = buildRoundStructure(drawSize);
  let changed = true;
  while (changed) {
    changed = false;
    for (const round of rounds) {
      for (const match of round.matches) {
        if (next[match.key]) continue;
        const [a, b] = resolveMatchEntrants(
          seats,
          next,
          match.round,
          match.indexInRound
        );
        if (a.kind === "bye" && b.kind === "player") {
          next[match.key] = b.ref;
          changed = true;
        } else if (b.kind === "bye" && a.kind === "player") {
          next[match.key] = a.ref;
          changed = true;
        }
      }
    }
  }
  return next;
}

export function countPicksMade(picks: BracketPicks, drawSize: number): number {
  const rounds = buildRoundStructure(drawSize);
  let n = 0;
  for (const round of rounds) {
    for (const match of round.matches) {
      if (picks[match.key]) n++;
    }
  }
  return n;
}

export function isBracketComplete(picks: BracketPicks, drawSize: number): boolean {
  return countPicksMade(picks, drawSize) >= totalMatches(drawSize);
}
