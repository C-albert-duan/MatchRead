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

export type SeatKind = "player" | "bye" | "tbd";
export type EntryStatus = "wc" | "pr" | "q" | "ll";

/** Official draw seat. player_id is set only for kind=player. */
export type DrawSeat = {
  position: number;
  kind: SeatKind;
  player_id: string | null;
  last_name: string;
  seed: number | null;
  country_code: string;
  entry?: EntryStatus | null;
  tbd_label?: string | null;
};

export function seatKind(
  seat: Pick<DrawSeat, "kind"> & { is_bye?: boolean; seat_kind?: SeatKind }
): SeatKind {
  if (seat.kind) return seat.kind;
  if (seat.seat_kind) return seat.seat_kind;
  if (seat.is_bye) return "bye";
  return "player";
}

export function isFictionalSeatName(last: string | null | undefined): boolean {
  const s = String(last || "").trim();
  return !s || /^player\d*$/i.test(s) || /^player\s+\d+/i.test(s);
}

/** Legacy fixture refs p-0… — never valid as player_id. */
export function isFictionalSeatRef(ref: string | null | undefined): boolean {
  return /^p-\d+$/i.test(String(ref || "").trim());
}

export function isNamedPlayerSeat(
  seat: Pick<DrawSeat, "kind" | "last_name" | "player_id"> & {
    seat_kind?: SeatKind;
    is_bye?: boolean;
    player_ref?: string;
  }
): boolean {
  if (seatKind(seat) !== "player") return false;
  if (!seat.player_id && !seat.player_ref) return false;
  if (isFictionalSeatName(seat.last_name)) return false;
  if (isFictionalSeatRef(seat.player_id ?? seat.player_ref)) return false;
  return true;
}

export function isPublicDrawSeat(
  seat: Pick<DrawSeat, "kind" | "last_name" | "player_id"> & {
    seat_kind?: SeatKind;
    is_bye?: boolean;
  }
): boolean {
  const kind = seatKind(seat);
  if (kind === "bye" || kind === "tbd") return true;
  return isNamedPlayerSeat(seat);
}

/** Official sheet: every slot is named, a published bye, or official TBD. */
export function isOfficialPublicDraw(
  seats: DrawSeat[],
  drawSize: number
): boolean {
  const n = Number(drawSize);
  if (!n || seats.length !== n) return false;
  if ((n & (n - 1)) !== 0) return false;
  return seats.every(isPublicDrawSeat);
}

/** A name that can appear in a slot — player, bye, TBD, dash, or unpicked. */
export type SlotOccupant =
  | {
      kind: "player";
      /** Player UUID (string). */
      ref: string;
      lastName: string;
      seed: number | null;
      countryCode: string;
      entryStatus?: EntryStatus | null;
    }
  | { kind: "bye" }
  | { kind: "tbd" }
  | { kind: "dash" }
  | { kind: "unpicked" };

/** matchKey → player UUID */
export type BracketPicks = Record<string, string>;

function seatToOccupant(seat: DrawSeat | undefined): SlotOccupant {
  if (!seat) return { kind: "dash" };
  const kind = seatKind(seat);
  if (kind === "bye") return { kind: "bye" };
  if (kind === "tbd") return { kind: "tbd" };
  if (!seat.player_id) return { kind: "dash" };
  return {
    kind: "player",
    ref: seat.player_id,
    lastName: seat.last_name,
    seed: seat.seed,
    countryCode: seat.country_code,
    entryStatus: seat.entry ?? null,
  };
}

function pickToOccupant(
  playerId: string | undefined,
  seatsByPlayer: Map<string, DrawSeat>
): SlotOccupant {
  if (!playerId) return { kind: "dash" };
  const seat = seatsByPlayer.get(playerId);
  if (!seat) {
    return {
      kind: "player",
      ref: playerId,
      lastName: "?",
      seed: null,
      countryCode: "XXX",
    };
  }
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
  const seatsByPlayer = new Map(
    seats
      .filter((s) => s.player_id)
      .map((s) => [s.player_id as string, s])
  );
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
    pickToOccupant(picks[feederA], seatsByPlayer),
    pickToOccupant(picks[feederB], seatsByPlayer),
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
