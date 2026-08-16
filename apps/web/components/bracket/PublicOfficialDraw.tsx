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
  /** Signed-in entry path. Omit on the public calendar so names stay read-only. */
  enterHref?: string;
  entryOpen: boolean;
};

/** Public sheet: official seats, results, and times. Picking is a separate CTA. */
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
  const canPick = Boolean(entryOpen && enterHref);

  return (
    <BracketGrid
      drawSize={drawSize}
      seats={seats}
      picks={{}}
      confidence={{}}
      locked={!canPick}
      official={official}
      schedule={schedule}
      venueTz={venueTz}
      locale={locale}
      onPick={
        canPick && enterHref
          ? () => {
              track("pick_started", { source: "public_draw" });
              router.push(enterHref);
            }
          : undefined
      }
    />
  );
}
