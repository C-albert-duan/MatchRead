"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { matchStartCaption } from "@/lib/tournaments/format";

type Props = {
  relevantRound: number;
  /** Accessible name for the horizontal scroll region. */
  label?: string;
  locale?: string;
  tba?: string;
  tbc?: string;
  children: ReactNode;
};

/**
 * One client island for the public sheet: align the unfinished round, then
 * fill clocks that need the viewer zone. Match nodes stay server markup.
 */
export function BracketScroller({
  relevantRound,
  label,
  locale,
  tba,
  tbc,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    if (tba && tbc) {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
      for (const el of stage.querySelectorAll<HTMLElement>("[data-clock]")) {
        const when = matchStartCaption(
          { scheduled_at: el.getAttribute("data-clock"), has_time: true },
          zone,
          locale ?? "en",
          tba,
          tbc
        );
        if (when) el.textContent = when;
      }
    }
    if (relevantRound <= 0) return;
    const column = stage.querySelector<HTMLElement>(
      `.bracket-col[data-round="${relevantRound}"]`
    );
    if (!column) return;
    const stageLeft = stage.getBoundingClientRect().left;
    const columnLeft = column.getBoundingClientRect().left;
    if (Math.abs(columnLeft - stageLeft) < 2) return;
    stage.scrollLeft += columnLeft - stageLeft;
  }, [relevantRound, locale, tba, tbc, children]);

  return (
    <div
      ref={ref}
      className="bracket-stage"
      {...(label
        ? { role: "region" as const, "aria-label": label, tabIndex: 0 }
        : {})}
    >
      {children}
    </div>
  );
}
