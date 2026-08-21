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

function pointOn(
  el: Element,
  root: DOMRect,
  edge: "right" | "left"
): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return {
    x: (edge === "right" ? r.right : r.left) - root.left,
    y: r.top + r.height / 2 - root.top,
  };
}

/**
 * Draw elbows from each match into the next-round seat.
 * SVG lives inside `.bracket-grid` so coords are grid-local (no scroll math).
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
              `[data-match-key="${match.key}"]`
            );
            if (!cell) continue;

            const parentRound = match.round + 1;
            const parentIndex = Math.floor(match.indexInRound / 2);
            const seat = match.indexInRound % 2;
            const parentCell = grid.querySelector(
              `[data-round="${parentRound}"][data-index="${parentIndex}"]`
            );
            if (!parentCell) continue;

            const winner = winnerRefFor(match.key, displayPicks, official);
            const sourceEl =
              (winner
                ? cell.querySelector(`[data-player-ref="${winner}"]`)
                : null) ??
              cell.querySelector(".slot") ??
              cell;
            const targetEl =
              (winner
                ? parentCell.querySelector(`[data-player-ref="${winner}"]`)
                : null) ??
              parentCell.querySelector(`[data-seat="${seat}"]`) ??
              parentCell.querySelector(".slot") ??
              parentCell;

            const from = pointOn(sourceEl, box, "right");
            const to = pointOn(targetEl, box, "left");
            const mid = (from.x + to.x) / 2;
            if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) continue;
            // Skip degenerate paths (collapsed layout).
            if (Math.abs(to.x - from.x) < 4) continue;

            next.push({
              id: `${match.key}-${parentRound}-${parentIndex}-${seat}`,
              d: `M${from.x.toFixed(1)} ${from.y.toFixed(1)} H${mid.toFixed(1)} V${to.y.toFixed(1)} H${to.x.toFixed(1)}`,
              active: Boolean(winner),
            });
          }
        }

        setSize({
          w: Math.max(grid.scrollWidth, box.width),
          h: Math.max(grid.scrollHeight, box.height),
        });
        setPaths(next);
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    window.addEventListener("resize", measure);
    const t1 = window.setTimeout(measure, 0);
    const t2 = window.setTimeout(measure, 100);
    document.fonts?.ready?.then(measure).catch(() => {});

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // rounds is memoized by drawSize in BracketGrid — do not pass unstable arrays.
  }, [gridRef, rounds, displayPicks, official]);

  if (size.w < 8 || size.h < 8) return null;

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
          fill="none"
          stroke={p.active ? "#1f6b4a" : "#6a7a72"}
          strokeWidth={p.active ? 2.5 : 2}
          strokeLinecap="square"
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
