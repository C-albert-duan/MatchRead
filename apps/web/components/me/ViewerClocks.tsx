"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { matchStartCaption } from "@/lib/tournaments/format";

/**
 * Fills `[data-clock]` start times in the viewer's zone after mount. The
 * server cannot know that zone, so timed clocks render empty there rather
 * than in UTC. Same rule as the bracket sheet.
 */
export function ViewerClocks({
  locale,
  tba,
  tbc,
  children,
}: {
  locale: string;
  tba: string;
  tbc: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scope = root.current;
    if (!scope) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
    for (const el of scope.querySelectorAll<HTMLElement>("[data-clock]")) {
      const when = matchStartCaption(
        { scheduled_at: el.getAttribute("data-clock"), has_time: true },
        zone,
        locale,
        tba,
        tbc
      );
      if (when) el.textContent = when;
    }
  });
  return (
    <div ref={root} className="stack gap-2xl">
      {children}
    </div>
  );
}
