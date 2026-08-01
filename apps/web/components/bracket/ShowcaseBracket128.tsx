"use client";

import { useMemo, useState } from "react";
import {
  applyByeAdvances,
  buildRoundStructure,
  type BracketConfidence,
  type BracketPicks,
  type DrawSeat,
} from "@matchread/core";
import { BracketGrid } from "@/components/bracket/BracketGrid";

const DRAW = 128;

function makeSeats(): DrawSeat[] {
  const seats: DrawSeat[] = [];
  for (let i = 0; i < DRAW; i += 1) {
    seats.push({
      position: i,
      player_ref: `p${String(i + 1).padStart(3, "0")}`,
      last_name: `Player${i + 1}`,
      seed: i < 32 ? i + 1 : null,
      country_code: "XX",
      is_bye: false,
    });
  }
  return seats;
}

/**
 * Local-only 128-draw smoke (no DB). Confirms H-scroll + early-round pick UI.
 */
export function ShowcaseBracket128() {
  const seats = useMemo(() => makeSeats(), []);
  const rounds = useMemo(() => buildRoundStructure(DRAW), []);
  const [picks, setPicks] = useState<BracketPicks>(() =>
    applyByeAdvances(seats, {}, DRAW)
  );
  const [confidence, setConfidence] = useState<BracketConfidence>({});

  return (
    <div className="stack gap-lg">
      <div className="stack gap-sm">
        <h2 className="t-page-title" style={{ fontSize: "1.35rem" }}>
          128-draw smoke
        </h2>
        <p className="t-lead">
          Synthetic slam-size bracket ({DRAW} players, {rounds.length} rounds).
          Scroll horizontally to the Final. Early-round picks stay in this
          browser only â€” nothing is saved.
        </p>
      </div>
      <BracketGrid
        drawSize={DRAW}
        seats={seats}
        picks={picks}
        confidence={confidence}
        locked={false}
        onPick={(matchKey, playerRef) => {
          setPicks((prev) =>
            applyByeAdvances(seats, { ...prev, [matchKey]: playerRef }, DRAW)
          );
        }}
        onConfidence={(matchKey, level) => {
          setConfidence((prev) => ({ ...prev, [matchKey]: level }));
        }}
      />
    </div>
  );
}
