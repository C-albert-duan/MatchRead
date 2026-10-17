import type { DrawSeat, OfficialResults } from "@matchread/core";
import { BracketTree } from "@/components/bracket/BracketTree";
import type { MatchScheduleRow } from "@/lib/tournaments/format";

type Props = {
  drawSize: number;
  seats: DrawSeat[];
  official: OfficialResults;
  schedule: Record<string, MatchScheduleRow>;
  locale: string;
};

/** Public sheet. Nodes are server markup. The editor keeps BracketGrid. */
export function PublicOfficialDraw({
  drawSize,
  seats,
  official,
  schedule,
  locale,
}: Props) {
  return (
    <BracketTree
      drawSize={drawSize}
      seats={seats}
      official={official}
      schedule={schedule}
      locale={locale}
    />
  );
}
