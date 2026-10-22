/**
 * Deterministic 16-player bracket for later replay tests.
 * Winners below are stored facts. Nothing here advances a player.
 */

import {
  buildRoundStructure,
  feederMatchKeys,
  feedsMatchKey,
  matchKey,
  type DrawSeat,
} from "./bracket.ts";

export type SyntheticSession = "day" | "night" | null;

export type SyntheticPlayer = {
  ref: string;
  lastName: string;
};

export type SyntheticMatch = {
  key: string;
  round: number;
  indexInRound: number;
  externalRef: string;
  sideARef: string | null;
  sideBRef: string | null;
  winnerRef: string | null;
  voided: boolean;
  officialScore: string | null;
  factKind: "played" | "withdrawal" | "void" | null;
  scheduledAt: string | null;
  hasTime: boolean;
  session: SyntheticSession;
  court: string | null;
  feeds: string | null;
  feeders: [string, string] | null;
};

export type SyntheticBracket = {
  drawSize: 16;
  slug: "syn-16";
  players: SyntheticPlayer[];
  seats: DrawSeat[];
  matches: SyntheticMatch[];
};

const LAST_NAMES = [
  "Alden",
  "Berg",
  "Costa",
  "Dahl",
  "Ellis",
  "Frost",
  "Greco",
  "Holm",
  "Ivers",
  "Jung",
  "Klein",
  "Lange",
  "Mora",
  "Niles",
  "Ortega",
  "Pell",
] as const;

function playerRef(index: number): string {
  return `syn16-p${String(index + 1).padStart(2, "0")}`;
}

export function buildSyntheticBracket16(): SyntheticBracket {
  const players: SyntheticPlayer[] = LAST_NAMES.map((lastName, index) => ({
    ref: playerRef(index),
    lastName,
  }));
  const seats: DrawSeat[] = players.map((player, position) => ({
    position,
    kind: "player",
    player_id: player.ref,
    last_name: player.lastName,
    seed: null,
    country_code: "XXX",
    entry: null,
    tbd_label: null,
  }));

  const rounds = buildRoundStructure(16);
  const stored = new Map<string, Partial<SyntheticMatch>>();
  stored.set("r0-m0", {
    sideARef: playerRef(0),
    sideBRef: playerRef(1),
    winnerRef: playerRef(0),
    officialScore: "6-4 6-3",
    factKind: "played",
    scheduledAt: "2026-08-10T14:00:00.000Z",
    hasTime: true,
    session: "day",
    court: "Court 1",
  });
  stored.set("r0-m1", {
    sideARef: playerRef(2),
    sideBRef: playerRef(3),
    winnerRef: playerRef(3),
    officialScore: "7-5 6-2",
    factKind: "played",
    scheduledAt: "2026-08-10T02:00:00.000Z",
    hasTime: true,
    session: "night",
    court: "Court 2",
  });
  stored.set("r0-m2", {
    sideARef: playerRef(4),
    sideBRef: playerRef(5),
    scheduledAt: "2026-08-11T12:00:00.000Z",
    hasTime: false,
    session: null,
    court: null,
  });
  stored.set("r0-m3", {
    sideARef: playerRef(6),
    sideBRef: playerRef(7),
    scheduledAt: null,
    hasTime: false,
    session: null,
    court: null,
  });
  // Parent sides are already stored. The scoreline above is not re-read.
  stored.set("r1-m0", {
    sideARef: playerRef(0),
    sideBRef: playerRef(3),
    winnerRef: null,
    scheduledAt: null,
    hasTime: false,
    session: null,
    court: null,
  });

  const matches: SyntheticMatch[] = [];
  for (const round of rounds) {
    for (const match of round.matches) {
      const extra = stored.get(match.key);
      const roundZero = match.round === 0;
      matches.push({
        key: match.key,
        round: match.round,
        indexInRound: match.indexInRound,
        externalRef: `syn16-${matchKey(match.round, match.indexInRound)}`,
        sideARef: extra?.sideARef ?? (roundZero ? playerRef(match.indexInRound * 2) : null),
        sideBRef:
          extra?.sideBRef ??
          (roundZero ? playerRef(match.indexInRound * 2 + 1) : null),
        winnerRef: extra?.winnerRef ?? null,
        voided: false,
        officialScore: extra?.officialScore ?? null,
        factKind: extra?.factKind ?? null,
        scheduledAt: extra && "scheduledAt" in extra ? extra.scheduledAt ?? null : null,
        hasTime: extra?.hasTime ?? false,
        session: extra?.session ?? null,
        court: extra?.court ?? null,
        feeds: feedsMatchKey(match.round, match.indexInRound, rounds.length),
        feeders: feederMatchKeys(match.round, match.indexInRound),
      });
    }
  }

  return { drawSize: 16, slug: "syn-16", players, seats, matches };
}
