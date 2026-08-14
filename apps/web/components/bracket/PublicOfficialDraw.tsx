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
  /** /enter/[ref] or /sign-in?next=/enter/[ref] */
  enterHref: string;
  entryOpen: boolean;
};

/** Public sheet: named first-round clicks send the visitor to enter (sign-in if needed). No anon save. */
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

  return (
    <BracketGrid
      drawSize={drawSize}
      seats={seats}
      picks={{}}
      confidence={{}}
      locked={!entryOpen}
      official={official}
      schedule={schedule}
      venueTz={venueTz}
      locale={locale}
      onPick={
        entryOpen
          ? () => {
              track("pick_started", { source: "public_draw" });
              router.push(enterHref);
            }
          : undefined
      }
    />
  );
}
