"use client";

import { useMemo, useRef, type CSSProperties } from "react";
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
import { BracketConnectors } from "@/components/bracket/BracketConnectors";
import { PlayerChip } from "@/components/bracket/PlayerChip";
import { useT } from "@/components/shell/LocaleProvider";
import {
  formatMatchWhen,
  type MatchScheduleRow,
} from "@/lib/tournaments/format";

type Props = {
  drawSize: number;
  seats: DrawSeat[];
  picks: BracketPicks;
  confidence: BracketConfidence;
  locked: boolean;
  /** When set, decided matches show pick vs official winner. */
  official?: OfficialResults;
  schedule?: Record<string, MatchScheduleRow>;
  venueTz?: string;
  locale?: string;
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
  const seat = seats.find((s) => s.player_id === ref);
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
  schedule = {},
  venueTz = "UTC",
  locale = "en",
  onPick,
  onConfidence,
}: Props) {
  const t = useT();
  const tbc = t("calendar.dateTbc");
  const rounds = buildRoundStructure(drawSize);
  const r0Slots = drawSize / 2;
  const regionRef = useRef<HTMLDivElement>(null);
  const regionStyle = {
    ["--r0-slots"]: String(r0Slots),
    ["--round-count"]: String(rounds.length),
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

  const connectorRounds = useMemo(
    () =>
      rounds.map((round) => ({
        index: round.index,
        matches: round.matches.map((m) => ({
          key: m.key,
          round: m.round,
          indexInRound: m.indexInRound,
        })),
      })),
    [rounds]
  );

  return (
    <div
      className="bracket-region"
      ref={regionRef}
      tabIndex={0}
      role="region"
      aria-label="Tournament bracket"
      style={regionStyle}
    >
      <BracketConnectors
        regionRef={regionRef}
        rounds={connectorRounds}
        displayPicks={displayPicks}
        official={official}
      />
      <div className="bracket-court" aria-hidden>
        <span className="bracket-court-baseline" />
        <span className="bracket-court-service" />
        <span className="bracket-court-net" />
      </div>
      <div className="bracket-grid">
        {rounds.map((round) => (
          <div key={round.index} className="bracket-col">
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
                // Winner chip highlight is enough — no "Won: …" block.
                const showPickGrade =
                  graded && !byeMatch && chosen != null && !voided;
                let gradeLabel: string | null = null;
                if (showPickGrade) {
                  gradeLabel =
                    chosen === officialWinner
                      ? "Correct"
                      : `Miss · ${seatName(seats, officialWinner)}`;
                } else if (graded && voided && chosen != null) {
                  gradeLabel = "Void";
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

                const when = schedule[match.key]
                  ? formatMatchWhen(
                      schedule[match.key],
                      venueTz,
                      locale,
                      tbc
                    )
                  : null;

                if (byeMatch && advancer) {
                  return (
                    <div
                      key={match.key}
                      className="match-cell match-cell--bye"
                      data-match-key={match.key}
                      data-round={match.round}
                      data-index={match.indexInRound}
                    >
                      <div
                        className="slot slot--bye"
                        role="group"
                        aria-label={`${advancer.lastName} advances (bye)`}
                      >
                        <PlayerChip
                          occupant={advancer}
                          grade="official"
                          seat={0}
                        />
                        <span className="bye-tag">Bye · advances</span>
                      </div>
                      {when ? (
                        <p className="match-when numeral">{when}</p>
                      ) : null}
                    </div>
                  );
                }

                const resultTone = graded
                  ? voided
                    ? "voided"
                    : chosen && chosen === officialWinner
                      ? "correct"
                      : chosen
                        ? "incorrect"
                        : "result"
                  : undefined;

                return (
                  <div
                    key={match.key}
                    className="match-cell"
                    data-match-key={match.key}
                    data-round={match.round}
                    data-index={match.indexInRound}
                  >
                    <div
                      className="slot"
                      role="radiogroup"
                      aria-label={`${round.label.match} match ${match.indexInRound + 1}${unpicked ? ", unpicked" : ""}${
                        officialWinner
                          ? `, won by ${seatName(seats, officialWinner)}`
                          : ""
                      }`}
                      data-unpicked={unpicked ? "true" : undefined}
                      data-confidence={showConfidence ? "true" : undefined}
                      data-graded={resultTone}
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
                            seat={0}
                            onClick={() =>
                              a.kind === "player" &&
                              onPick?.(match.key, a.ref)
                            }
                          />
                          <PlayerChip
                            as="button"
                            occupant={b}
                            chosen={chosen === refOf(b)}
                            name={groupName}
                            value={refOf(b) ?? ""}
                            checked={chosen === refOf(b)}
                            seat={1}
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
                            seat={0}
                          />
                          <PlayerChip
                            occupant={b}
                            chosen={b.kind === "player" && chosen === b.ref}
                            grade={gradeB}
                            seat={1}
                          />
                        </>
                      )}
                    </div>
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
                    {gradeLabel ? (
                      <div className="grade-row" aria-hidden="true">
                        {gradeLabel}
                      </div>
                    ) : null}
                    {when ? (
                      <p className="match-when numeral">{when}</p>
                    ) : null}
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
