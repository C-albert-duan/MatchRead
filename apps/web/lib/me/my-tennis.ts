/**
 * My Tennis view model from loaded context. Pure: the use case does the I/O.
 *
 * One row per match the user has a stake in, ranked by `rankMyMatches`. When
 * the user holds brackets in several leagues for one tournament, a match
 * keeps the bracket whose top reason is most pressing. A match point comes
 * from the side-a live score and the tournament's match format; a break point
 * stays null because the feed has no server (docs/v3-m4-decisions.md D-M4-1).
 */
import {
  ceilingDeltaIfLost,
  ceilingMaths,
  compareReasons,
  derivePointFlags,
  eliminatedRefs,
  leader,
  matchConsequence,
  matters,
  rankMyMatches,
  reasonsFor,
  type BracketPicks,
  type CeilingInput,
  type DrawSeat,
  type ImportanceConfig,
  type LiveLead,
  type MatchConsequence,
  type MatchStatus,
  type OfficialResults,
  type SetsToWin,
} from "@matchread/core";
import type { LiveDisplayState } from "../live/view.ts";

export type MyTennisMatch = {
  key: string;
  externalRef: string;
  round: number;
  sideARef: string | null;
  sideALastName: string | null;
  sideBRef: string | null;
  sideBLastName: string | null;
  winnerRef: string | null;
  voided: boolean;
  officialScore: string | null;
  scheduledAt: string | null;
  hasTime: boolean;
  session: "day" | "night" | null;
  court: string | null;
};

export type MyTennisTournament = {
  /** Tournament uuid. The live layer subscribes by it, as bracket cells do. */
  id: string;
  ref: string;
  name: string;
  drawSize: number;
  /** From tour and tier; null leaves match points underived. */
  setsToWin: SetsToWin | null;
  seats: DrawSeat[];
  matches: MyTennisMatch[];
};

export type MyTennisBracket = {
  bracketId: string;
  leagueId: string;
  tournamentRef: string;
  picks: BracketPicks;
};

export type MyTennisContext = {
  brackets: MyTennisBracket[];
  tournaments: Record<string, MyTennisTournament>;
  /** Keyed by match external ref. */
  live: Record<string, LiveDisplayState>;
};

export type MyMatchSide = { ref: string; lastName: string };

export type MyMatchRow = {
  matchRef: string;
  matchKey: string;
  tournamentRef: string;
  tournamentId: string;
  tournamentName: string;
  leagueId: string;
  round: number;
  status: MatchStatus;
  startsAt: string | null;
  hasTime: boolean;
  session: "day" | "night" | null;
  court: string | null;
  sideA: MyMatchSide | null;
  sideB: MyMatchSide | null;
  pickRef: string | null;
  winnerRef: string | null;
  officialScore: string | null;
  live: Pick<LiveDisplayState, "phase" | "sets" | "game" | "serving" | "receivedAt"> | null;
  setsToWin: SetsToWin | null;
  consequence: MatchConsequence;
  /** Clears MATTERS_FLOOR; the list shows only these. */
  matters: boolean;
};

export type MyTennisTriad = {
  bracketId: string;
  leagueId: string;
  tournamentRef: string;
  banked: number;
  projected: number;
  ceiling: number;
};

export type MyTennisView = {
  rows: MyMatchRow[];
  triads: MyTennisTriad[];
  /** Last names for every player a row or reason can name. */
  names: Record<string, string>;
};

function officialOf(matches: readonly MyTennisMatch[]): OfficialResults {
  const official: OfficialResults = {};
  for (const match of matches) {
    if (!match.voided && !match.winnerRef) continue;
    official[match.key] = {
      winnerRef: match.voided ? null : match.winnerRef,
      voided: match.voided,
      officialScore: match.officialScore,
    };
  }
  return official;
}

function side(ref: string | null, lastName: string | null): MyMatchSide | null {
  return ref ? { ref, lastName: lastName ?? "" } : null;
}

function statusOf(match: MyTennisMatch, live: LiveDisplayState | undefined): MatchStatus {
  if (match.voided || match.winnerRef) return "final";
  return live ? "live" : "scheduled";
}

/** The bracket that makes a match most pressing wins; ties keep the larger stake. */
function better(left: MyMatchRow, right: MyMatchRow): MyMatchRow {
  const a = left.consequence.reasons[0];
  const b = right.consequence.reasons[0];
  const order = compareReasons(a, b);
  if (order !== 0) return order < 0 ? left : right;
  if (left.consequence.ceilingDeltaIfLost !== right.consequence.ceilingDeltaIfLost) {
    return left.consequence.ceilingDeltaIfLost > right.consequence.ceilingDeltaIfLost ? left : right;
  }
  return left.leagueId <= right.leagueId ? left : right;
}

export function assembleMyTennis(ctx: MyTennisContext, config: ImportanceConfig): MyTennisView {
  const byMatch = new Map<string, MyMatchRow>();
  const triads: MyTennisTriad[] = [];

  for (const bracket of ctx.brackets) {
    const tournament = ctx.tournaments[bracket.tournamentRef];
    if (!tournament) continue;
    const official = officialOf(tournament.matches);
    const leads: Record<string, LiveLead> = {};
    for (const match of tournament.matches) {
      const live = ctx.live[match.externalRef];
      if (!live || statusOf(match, live) !== "live") continue;
      leads[match.key] = { sideARef: match.sideARef, sideBRef: match.sideBRef, sets: live.sets };
    }
    const input: CeilingInput = {
      drawSize: tournament.drawSize,
      seats: tournament.seats,
      picks: bracket.picks,
      official,
      live: leads,
    };
    triads.push({
      bracketId: bracket.bracketId,
      leagueId: bracket.leagueId,
      tournamentRef: tournament.ref,
      ...ceilingMaths(input),
    });

    const eliminated = eliminatedRefs(tournament.drawSize, tournament.seats, official);
    for (const match of tournament.matches) {
      const live = ctx.live[match.externalRef];
      const status = statusOf(match, live);
      const reasons = reasonsFor(
        {
          matchKey: match.key,
          status,
          sideARef: match.sideARef,
          sideBRef: match.sideBRef,
          winnerRef: match.winnerRef,
          leader: status === "live" ? leader(live?.sets) : null,
          pointFlags:
            status === "live" && live
              ? derivePointFlags({
                  oriented: true,
                  sets: live.sets,
                  game: live.game,
                  serving: live.serving,
                  setsToWin: tournament.setsToWin,
                })
              : null,
        },
        { drawSize: tournament.drawSize, picks: bracket.picks, eliminated }
      );
      if (!reasons.length) continue;

      const pick = bracket.picks[match.key] ?? null;
      const entrants = [match.sideARef, match.sideBRef].filter((ref): ref is string => Boolean(ref));
      const exposed = pick && entrants.includes(pick) ? [pick] : entrants;
      let delta = { points: 0, affectedForwardNodes: [] as string[] };
      for (const ref of exposed) {
        const next = ceilingDeltaIfLost(input, match.key, ref);
        if (next.points > delta.points) delta = next;
      }

      const row: MyMatchRow = {
        matchRef: match.externalRef,
        matchKey: match.key,
        tournamentRef: tournament.ref,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        leagueId: bracket.leagueId,
        round: match.round,
        status,
        startsAt: match.scheduledAt,
        hasTime: match.hasTime,
        session: match.session,
        court: match.court,
        sideA: side(match.sideARef, match.sideALastName),
        sideB: side(match.sideBRef, match.sideBLastName),
        pickRef: pick,
        winnerRef: match.winnerRef,
        officialScore: match.officialScore,
        live:
          live && status === "live"
            ? {
                phase: live.phase,
                sets: live.sets,
                game: live.game,
                serving: live.serving,
                receivedAt: live.receivedAt,
              }
            : null,
        setsToWin: tournament.setsToWin,
        consequence: matchConsequence(
          {
            matchRef: match.externalRef,
            reasons,
            ceilingDeltaIfLost: delta.points,
            affectedForwardNodes: delta.affectedForwardNodes,
          },
          config
        ),
        matters: matters(reasons),
      };
      const held = byMatch.get(row.matchRef);
      byMatch.set(row.matchRef, held ? better(held, row) : row);
    }
  }

  const ranked = rankMyMatches(
    [...byMatch.values()].map((row) => ({
      ...row,
      topPrio: row.consequence.reasons[0]?.prio ?? null,
    }))
  ).map(({ topPrio: _topPrio, ...row }) => row);

  triads.sort((a, b) =>
    a.tournamentRef === b.tournamentRef
      ? a.leagueId < b.leagueId ? -1 : a.leagueId > b.leagueId ? 1 : 0
      : a.tournamentRef < b.tournamentRef ? -1 : 1
  );
  const names: Record<string, string> = {};
  for (const tournament of Object.values(ctx.tournaments)) {
    for (const seat of tournament.seats) {
      if (seat.player_id && seat.last_name) names[seat.player_id] = seat.last_name;
    }
    for (const match of tournament.matches) {
      if (match.sideARef && match.sideALastName) names[match.sideARef] = match.sideALastName;
      if (match.sideBRef && match.sideBLastName) names[match.sideBRef] = match.sideBLastName;
    }
  }
  return { rows: ranked, triads, names };
}
