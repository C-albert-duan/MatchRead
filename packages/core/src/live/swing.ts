/**
 * League Swing: a match swings a league when its result changes who is first.
 * Pure: no I/O, no clock.
 *
 * Each member's points are their banked total as it stands (points from the
 * league's other tournaments plus this bracket graded on official results).
 * A match's winner adds its round weight to every member who picked them,
 * and the champion bonus too on the final. A tie at the top is shared first
 * place, so a tie becoming a sole leader is a swing.
 */

import { buildRoundStructure, type BracketPicks } from "../bracket";
import { roundWeight } from "../scoring";

export type SwingMember = {
  memberId: string;
  /** Banked total across the league before this match. */
  points: number;
  picks: BracketPicks;
};

export type SwingMatch = {
  matchKey: string;
  sideARef: string | null;
  sideBRef: string | null;
};

/** Points a correct pick on this match adds: round weight, plus the champion bonus on the final. */
function gainFor(drawSize: number, matchKey: string): number | null {
  const at = /^r(\d+)-m\d+$/.exec(matchKey);
  if (!at) return null;
  const round = Number(at[1]);
  const lastRound = buildRoundStructure(drawSize).length - 1;
  if (round > lastRound) return null;
  return roundWeight(round) + (round === lastRound ? roundWeight(lastRound) : 0);
}

/** Members sharing the top score, sorted, as one comparable key. */
function firstPlace(scores: ReadonlyArray<readonly [string, number]>): string {
  let top = -Infinity;
  for (const [, score] of scores) top = Math.max(top, score);
  return scores
    .filter(([, score]) => score === top)
    .map(([id]) => id)
    .sort()
    .join("|");
}

/** True when side a winning and side b winning leave different members first. */
export function swingsFirstPlace(
  drawSize: number,
  members: readonly SwingMember[],
  match: SwingMatch
): boolean {
  if (members.length < 2 || !match.sideARef || !match.sideBRef) return false;
  const gain = gainFor(drawSize, match.matchKey);
  if (gain == null) return false;
  const after = (winner: string) =>
    firstPlace(
      members.map(
        (member) =>
          [
            member.memberId,
            member.points + (member.picks[match.matchKey] === winner ? gain : 0),
          ] as const
      )
    );
  return after(match.sideARef) !== after(match.sideBRef);
}
