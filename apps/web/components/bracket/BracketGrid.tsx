"use client";

import { useMemo, type CSSProperties } from "react";
import {
  applyByeAdvances,
  buildRoundStructure,
  resolveMatchEntrants,
  type BracketConfidence,
  type BracketPicks,
  type DrawSeat,
  type OfficialResults,
  type SlotOccupant,
} from "@matchread/core";
import { PlayerChip } from "@/components/bracket/PlayerChip";

type Props = {
  drawSize: number;
  seats: DrawSeat[];
  picks: BracketPicks;
  confidence: BracketConfidence;
  locked: boolean;
  /** When set, decided matches show pick vs official winner. */
  official?: OfficialResults;
  onPick?: (matchKey: string, playerRef: string) => void;
  onConfidence?: (matchKey: string, level: number) => void;
};

function bothKnown(a: SlotOccupant, b: SlotOccupant): boolean {
  return (
    (a.kind === "player" || a.kind === "bye") &&
    (b.kind === "player" || b.kind === "bye")
  );
}

function refOf(occupant: SlotOccupant): string | null {
  return occupant.kind === "player" ? occupant.ref : null;
}

function seatName(seats: DrawSeat[], ref: string | null): string {
  if (!ref) return "—";
  const seat = seats.find((s) => s.player_ref === ref);
  return seat?.last_name ?? ref;
}

function hasBye(a: SlotOccupant, b: SlotOccupant): boolean {
  return a.kind === "bye" || b.kind === "bye";
}

type ChipGrade = "correct" | "incorrect" | "voided" | "official" | null;

function chipGrade(input: {
  playerRef: string | null;
  pickRef: string | null;
  officialWinner: string | null;
  voided: boolean;
  graded: boolean;
}): ChipGrade {
  const { playerRef, pickRef, officialWinner, voided, graded } = input;
  if (!graded || !playerRef) return null;
  if (voided) {
    return pickRef === playerRef ? "voided" : null;
  }
  if (officialWinner === playerRef && pickRef === playerRef) return "correct";
  if (pickRef === playerRef && officialWinner !== playerRef) return "incorrect";
  if (officialWinner === playerRef && pickRef !== playerRef) return "official";
  return null;
}

export function BracketGrid({
  drawSize,
  seats,
  picks,
  confidence,
  locked,
  official = {},
  onPick,
  onConfidence,
}: Props) {
  const rounds = buildRoundStructure(drawSize);
  const r0Slots = drawSize / 2;
  const regionStyle = {
    ["--r0-slots"]: String(r0Slots),
  } as CSSProperties;

  // Later rounds must show official winners (and bye advances), not only
  // the member's picks — otherwise decided matches look empty with "Won: …".
  const displayPicks = useMemo(() => {
    const merged: BracketPicks = { ...picks };
    for (const [key, result] of Object.entries(official)) {
      if (result?.winnerRef && !result.voided) {
        merged[key] = result.winnerRef;
      }
    }
    return applyByeAdvances(seats, merged, drawSize);
  }, [picks, official, seats, drawSize]);

  return (
    <div
      className="bracket-region"
      tabIndex={0}
      role="region"
      aria-label="Tournament bracket"
      style={regionStyle}
    >
      <div className="bracket-court" aria-hidden>
        <span className="bracket-court-baseline" />
        <span className="bracket-court-service" />
        <span className="bracket-court-net" />
      </div>
      <div className="bracket-grid">
        {rounds.map((round) => (
          <div
            key={round.index}
            className="bracket-col"
            data-round={round.index}
          >
            <h3 className="bracket-col-head t-caption">
              {round.label.column}
            </h3>
            <div className="bracket-col-body">
              {round.matches.map((match) => {
                const [a, b] = resolveMatchEntrants(
                  seats,
                  displayPicks,
                  match.round,
                  match.indexInRound
                );
                const chosen = picks[match.key] ?? null;
                const result = official[match.key];
                const graded = Boolean(
                  result && (result.voided || result.winnerRef)
                );
                const voided = Boolean(result?.voided);
                const officialWinner = result?.winnerRef ?? null;
                const byeMatch = hasBye(a, b);
                const advancer =
                  byeMatch && a.kind === "player"
                    ? a
                    : byeMatch && b.kind === "player"
                      ? b
                      : null;
                const pickable =
                  !locked &&
                  !graded &&
                  bothKnown(a, b) &&
                  a.kind === "player" &&
                  b.kind === "player";
                const groupName = `match-${match.key}`;
                const unpicked = Boolean(pickable && !chosen);
                const level = confidence[match.key] ?? null;
                const showConfidence = Boolean(chosen) && !graded;
                const showGrade = graded && !byeMatch;

                let gradeLabel: string | null = null;
                if (showGrade) {
                  if (voided) gradeLabel = "Void";
                  else if (!chosen)
                    gradeLabel = `Won: ${seatName(seats, officialWinner)}`;
                  else if (chosen === officialWinner) gradeLabel = "Correct";
                  else
                    gradeLabel = `Miss · Won: ${seatName(seats, officialWinner)}`;
                }

                const gradeA = chipGrade({
                  playerRef: refOf(a),
                  pickRef: chosen,
                  officialWinner,
                  voided,
                  graded,
                });
                const gradeB = chipGrade({
                  playerRef: refOf(b),
                  pickRef: chosen,
                  officialWinner,
                  voided,
                  graded,
                });

                if (byeMatch && advancer) {
                  return (
                    <div
                      key={match.key}
                      className="match-cell match-cell--bye"
                    >
                      <div
                        className="slot slot--bye"
                        role="group"
                        aria-label={`${advancer.lastName} advances (bye)`}
                      >
                        <PlayerChip occupant={advancer} grade="official" />
                        <span className="bye-tag">Bye · advances</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={match.key} className="match-cell">
                    <div
                      className="slot"
                      role="radiogroup"
                      aria-label={`${round.label.match} match ${match.indexInRound + 1}${unpicked ? ", unpicked" : ""}${gradeLabel ? `, ${gradeLabel}` : ""}`}
                      data-unpicked={unpicked ? "true" : undefined}
                      data-confidence={showConfidence ? "true" : undefined}
                      data-graded={
                        showGrade
                          ? voided
                            ? "voided"
                            : chosen && chosen === officialWinner
                              ? "correct"
                              : chosen
                                ? "incorrect"
                                : "result"
                          : undefined
                      }
                    >
                      {pickable ? (
                        <>
                          <PlayerChip
                            as="button"
                            occupant={a}
                            chosen={chosen === refOf(a)}
                            name={groupName}
                            value={refOf(a) ?? ""}
                            checked={chosen === refOf(a)}
                            onClick={() =>
                              a.kind === "player" &&
                              onPick?.(match.key, a.ref)
                            }
                          />
                          <div className="slot-divider" />
                          <PlayerChip
                            as="button"
                            occupant={b}
                            chosen={chosen === refOf(b)}
                            name={groupName}
                            value={refOf(b) ?? ""}
                            checked={chosen === refOf(b)}
                            onClick={() =>
                              b.kind === "player" &&
                              onPick?.(match.key, b.ref)
                            }
                          />
                        </>
                      ) : (
                        <>
                          <PlayerChip
                            occupant={a}
                            chosen={a.kind === "player" && chosen === a.ref}
                            grade={gradeA}
                          />
                          <div className="slot-divider" />
                          <PlayerChip
                            occupant={b}
                            chosen={b.kind === "player" && chosen === b.ref}
                            grade={gradeB}
                          />
                        </>
                      )}
                      {showConfidence ? (
                        <div
                          className="confidence-row"
                          role="group"
                          aria-label={`Confidence for ${round.label.match} match ${match.indexInRound + 1}`}
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              className="confidence-btn"
                              data-active={level === n ? "true" : undefined}
                              disabled={locked}
                              aria-pressed={level === n}
                              aria-label={`Confidence ${n} of 5`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onConfidence?.(match.key, n);
                              }}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {showGrade && gradeLabel ? (
                        <div className="grade-row" aria-hidden="true">
                          {gradeLabel}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
