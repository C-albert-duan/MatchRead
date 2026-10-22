"use client";

import type { LiveScoreFields } from "@/lib/live/score";

/** Badge, score, and serve mark for one cell. Not a bracket. */
export function LiveScore({ badge, score, serving, note }: LiveScoreFields) {
  return (
    <>
      {badge ? (
        <span className="live-badge" data-live-badge>
          {badge}
        </span>
      ) : null}
      <span className="live-score numeral" data-live-score>
        {score}
      </span>
      {serving ? (
        <span className="live-serve" data-live-serve>
          {serving}
        </span>
      ) : null}
      {note ? (
        <span className="live-note" data-live-note>
          {note}
        </span>
      ) : null}
    </>
  );
}
