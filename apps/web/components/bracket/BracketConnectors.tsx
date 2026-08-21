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
  /** Scrollport that contains the grid (`.bracket-region`). */
  regionRef: RefObject<HTMLElement | null>;
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

/** Content coordinates inside a scrollport (includes scroll offset). */
function pointInScrollport(
  el: Element,
  root: HTMLElement,
  edge: "right" | "left"
): { x: number; y: number } {
  const rootBox = root.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    x:
      (edge === "right" ? r.right : r.left) -
      rootBox.left +
      root.scrollLeft,
    y: r.top + r.height / 2 - rootBox.top + root.scrollTop,
  };
}

/**
 * SVG connectors from each match (prefer the advancing player chip)
 * into the matching seat of the next round. Recomputed on layout change.
 */
export function BracketConnectors({
  regionRef,
  rounds,
  displayPicks,
  official,
}: Props) {
  const [paths, setPaths] = useState<PathSeg[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const root = regionRef.current;
    if (!root) return;

    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const grid = root.querySelector(".bracket-grid");
        if (!grid) {
          setPaths([]);
          return;
        }

        const next: PathSeg[] = [];

        for (const col of rounds) {
          if (col.index >= rounds.length - 1) continue;
          for (const match of col.matches) {
            const cell = grid.querySelector(
              `[data-match-key="${CSS.escape(match.key)}"]`
            ) as HTMLElement | null;
            if (!cell) continue;

            const parentRound = match.round + 1;
            const parentIndex = Math.floor(match.indexInRound / 2);
            const seat = match.indexInRound % 2;
            const parentCell = grid.querySelector(
              `[data-round="${parentRound}"][data-index="${parentIndex}"]`
            ) as HTMLElement | null;
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

            const from = pointInScrollport(sourceEl, root, "right");
            const to = pointInScrollport(targetEl, root, "left");
            // Elbow in the gutter between columns.
            const mid = from.x + (to.x - from.x) * 0.5;
            if (
              !Number.isFinite(from.x) ||
              !Number.isFinite(from.y) ||
              !Number.isFinite(to.x) ||
              !Number.isFinite(to.y)
            ) {
              continue;
            }
            next.push({
              id: `${match.key}->${parentRound}-${parentIndex}-${seat}`,
              d: `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} H ${mid.toFixed(1)} V ${to.y.toFixed(1)} H ${to.x.toFixed(1)}`,
              active: Boolean(winner),
            });
          }
        }

        setSize({
          w: Math.max(root.scrollWidth, root.clientWidth),
          h: Math.max(root.scrollHeight, root.clientHeight),
        });
        setPaths(next);
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const grid = root.querySelector(".bracket-grid");
    if (grid) ro.observe(grid);
    root.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    document.fonts?.ready?.then(measure).catch(() => {});
    // Second pass after layout settles (fonts, flex).
    const t = window.setTimeout(measure, 50);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro.disconnect();
      root.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [regionRef, rounds, displayPicks, official]);

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
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
