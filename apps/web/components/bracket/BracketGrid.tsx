"use client";

import type { CSSProperties } from "react";
import {
  buildRoundStructure,
  resolveMatchEntrants,
  type BracketConfidence,
  type BracketPicks,
  type DrawSeat,
  type SlotOccupant,
} from "@matchread/core";
import { PlayerChip } from "@/components/bracket/PlayerChip";

type Props = {
  drawSize: number;
  seats: DrawSeat[];
  picks: BracketPicks;
  confidence: BracketConfidence;
  locked: boolean;
  onPick?: (matchKey: string, playerRef: string) => void;
  onConfidence?: (matchKey: string, level: number) => void;
};

function bothKnown(a: SlotOccupant, b: SlotOccupant): boolean {
  return (
    (a.kind === "player" || a.kind === "bye") &&
    (b.kind === "player" || b.kind === "bye")
  );
}

export function BracketGrid({
  drawSize,
  seats,
  picks,
  confidence,
  locked,
  onPick,
  onConfidence,
}: Props) {
  const rounds = buildRoundStructure(drawSize);
  const r0Slots = drawSize / 2;
  const regionStyle = {
    ["--r0-slots"]: String(r0Slots),
  } as CSSProperties;

  return (
    <div
      className="bracket-region"
      tabIndex={0}
      role="region"
      aria-label="Tournament bracket"
      style={regionStyle}
    >
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
                  picks,
                  match.round,
                  match.indexInRound
                );
                const chosen = picks[match.key] ?? null;
                const pickable =
                  !locked &&
                  bothKnown(a, b) &&
                  a.kind === "player" &&
                  b.kind === "player";
                const groupName = `match-${match.key}`;
                const unpicked = Boolean(pickable && !chosen);
                const level = confidence[match.key] ?? null;
                const showConfidence = Boolean(chosen);

                return (
                  <div key={match.key} className="match-cell">
                    <div
                      className="slot"
                      role="radiogroup"
                      aria-label={`${round.label.match} match ${match.indexInRound + 1}${unpicked ? ", unpicked" : ""}`}
                      data-unpicked={unpicked ? "true" : undefined}
                      data-confidence={showConfidence ? "true" : undefined}
                    >
                      {pickable ? (
                        <>
                          <PlayerChip
                            as="button"
                            occupant={a}
                            chosen={
                              chosen === (a.kind === "player" ? a.ref : "")
                            }
                            name={groupName}
                            value={a.kind === "player" ? a.ref : ""}
                            checked={
                              chosen === (a.kind === "player" ? a.ref : "")
                            }
                            onClick={() =>
                              a.kind === "player" &&
                              onPick?.(match.key, a.ref)
                            }
                          />
                          <div className="slot-divider" />
                          <PlayerChip
                            as="button"
                            occupant={b}
                            chosen={
                              chosen === (b.kind === "player" ? b.ref : "")
                            }
                            name={groupName}
                            value={b.kind === "player" ? b.ref : ""}
                            checked={
                              chosen === (b.kind === "player" ? b.ref : "")
                            }
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
                          />
                          <div className="slot-divider" />
                          <PlayerChip
                            occupant={b}
                            chosen={b.kind === "player" && chosen === b.ref}
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
