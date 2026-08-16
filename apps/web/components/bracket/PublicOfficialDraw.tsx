"use client";

import { useRouter } from "next/navigation";
import type { DrawSeat, OfficialResults } from "@matchread/core";
import { BracketGrid } from "@/components/bracket/BracketGrid";
import { track } from "@/lib/telemetry";
import type { MatchScheduleRow } from "@/lib/tournaments/format";

type Props = {
  drawSize: number;
  seats: DrawSeat[];
  official: OfficialResults;
  schedule: Record<string, MatchScheduleRow>;
  venueTz: string;
  locale: string;
  /** Path to start picking — may be sign-in?next=/enter/... for guests. */
  enterHref?: string;
  entryOpen: boolean;
};

/** Public sheet: official seats, results, and times. Pick → enter / sign-in. */
export function PublicOfficialDraw({
  drawSize,
  seats,
  official,
  schedule,
  venueTz,
  locale,
  enterHref,
  entryOpen,
}: Props) {
  const router = useRouter();
  const canStartPick = Boolean(entryOpen && enterHref);

  return (
    <BracketGrid
      drawSize={drawSize}
      seats={seats}
      picks={{}}
      confidence={{}}
      locked={!canStartPick}
      official={official}
      schedule={schedule}
      venueTz={venueTz}
      locale={locale}
      onPick={
        canStartPick && enterHref
          ? () => {
              track("pick_started", { source: "public_draw" });
              router.push(enterHref);
            }
          : undefined
      }
    />
  );
}
