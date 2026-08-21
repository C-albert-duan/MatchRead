"use client";

import {
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";
import type { BracketPicks, OfficialResults } from "@matchread/core";

type RoundMatch = {
  key: string;
  round: number;
  indexInRound: number;
};

type RoundCol = {
  index: number;
  matches: RoundMatch[];
};

type PathSeg = {
  id: string;
  d: string;
  active: boolean;
};

type Props = {
  gridRef: RefObject<HTMLElement | null>;
  rounds: RoundCol[];
  displayPicks: BracketPicks;
  official: OfficialResults;
};

function winnerRefFor(
  matchKey: string,
  displayPicks: BracketPicks,
  official: OfficialResults
): string | null {
  const o = official[matchKey];
  if (o?.winnerRef && !o.voided) return o.winnerRef;
  return displayPicks[matchKey] ?? null;
}

function pointIn(
  el: Element,
  grid: DOMRect,
  edge: "right" | "left"
): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return {
    x: (edge === "right" ? r.right : r.left) - grid.left,
    y: r.top + r.height / 2 - grid.top,
  };
}

/**
 * SVG connectors from each match (prefer the advancing player chip)
 * into the matching seat of the next round. Recomputed on layout change.
 */
export function BracketConnectors({
  gridRef,
  rounds,
  displayPicks,
  official,
}: Props) {
  const [paths, setPaths] = useState<PathSeg[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const box = grid.getBoundingClientRect();
        const next: PathSeg[] = [];

        for (const col of rounds) {
          if (col.index >= rounds.length - 1) continue;
          for (const match of col.matches) {
            const cell = grid.querySelector(
              `[data-match-key="${CSS.escape(match.key)}"]`
            );
            if (!cell) continue;

            const parentRound = match.round + 1;
            const parentIndex = Math.floor(match.indexInRound / 2);
            const seat = match.indexInRound % 2; // 0 top, 1 bottom
            const parentCell = grid.querySelector(
              `[data-round="${parentRound}"][data-index="${parentIndex}"]`
            );
            if (!parentCell) continue;

            const winner = winnerRefFor(match.key, displayPicks, official);
            const sourceEl =
              (winner
                ? cell.querySelector(
                    `[data-player-ref="${CSS.escape(winner)}"]`
                  )
                : null) ??
              cell.querySelector(".slot") ??
              cell;

            const targetEl =
              (winner
                ? parentCell.querySelector(
                    `[data-player-ref="${CSS.escape(winner)}"]`
                  )
                : null) ??
              parentCell.querySelector(`[data-seat="${seat}"]`) ??
              parentCell.querySelector(".slot") ??
              parentCell;

            const from = pointIn(sourceEl, box, "right");
            const to = pointIn(targetEl, box, "left");
            const mid = (from.x + to.x) / 2;
            next.push({
              id: `${match.key}->${parentRound}-${parentIndex}-${seat}`,
              d: `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} H ${mid.toFixed(1)} V ${to.y.toFixed(1)} H ${to.x.toFixed(1)}`,
              active: Boolean(winner),
            });
          }
        }

        setSize({ w: grid.scrollWidth, h: grid.scrollHeight });
        setPaths(next);
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    window.addEventListener("resize", measure);
    // Fonts / images can shift chip boxes after first paint.
    document.fonts?.ready?.then(measure).catch(() => {});

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [gridRef, rounds, displayPicks, official]);

  if (size.w <= 0 || size.h <= 0 || paths.length === 0) return null;

  return (
    <svg
      className="bracket-connectors"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      aria-hidden
    >
      {paths.map((p) => (
        <path
          key={p.id}
          d={p.d}
          className={
            p.active
              ? "bracket-connector bracket-connector--active"
              : "bracket-connector"
          }
          fill="none"
        />
      ))}
    </svg>
  );
}
