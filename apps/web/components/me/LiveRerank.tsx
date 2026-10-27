"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LIVE_PAINT_EVENT, type LivePaintDetail } from "@/lib/live/paint-event";
import { liveMark, ranksMayChange, refreshDelay, type LiveMark } from "@/lib/me/live-rerank";

/**
 * Re-ranks My Tennis when a live patch changes what the ranking reads: a
 * match going live or ending, the leader changing, or a match point starting
 * or ending. Other score ticks only patch in place. `marks` is what the
 * server ranked on.
 */
export function LiveRerank({ marks }: { marks: Record<string, LiveMark> }) {
  const router = useRouter();
  const known = useRef(new Map(Object.entries(marks)));
  known.current = new Map(Object.entries(marks));

  useEffect(() => {
    let lastAt: number | null = null;
    let timer: number | null = null;
    const onPaint = (event: Event) => {
      const detail = (event as CustomEvent<LivePaintDetail>).detail;
      if (!detail?.ref || !known.current.has(detail.ref)) return;
      const previous = known.current.get(detail.ref);
      const next = liveMark(detail.live, detail.sets, detail.game, previous?.setsToWin ?? null);
      if (!ranksMayChange(previous, next)) return;
      known.current.set(detail.ref, next);
      if (timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        lastAt = Date.now();
        router.refresh();
      }, refreshDelay(lastAt, Date.now()));
    };
    window.addEventListener(LIVE_PAINT_EVENT, onPaint);
    return () => {
      window.removeEventListener(LIVE_PAINT_EVENT, onPaint);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [router]);
  return null;
}
