/**
 * Editor seat. Pick controls stay here. The public sheet uses SeatName on the server.
 */
"use client";

import type { SlotOccupant } from "@matchread/core";
import type { PickHighlight, SeatSource } from "@/lib/brackets/resolution";
import { seatFace, type SeatLabels } from "@/components/bracket/SeatName";
import { useT } from "@/components/shell/LocaleProvider";

type GradeTone = "correct" | "incorrect" | "voided" | "official" | null;

type Props = {
  occupant: SlotOccupant;
  chosen?: boolean;
  grade?: GradeTone;
  as?: "span" | "button";
  disabled?: boolean;
  onClick?: () => void;
  name?: string;
  value?: string;
  checked?: boolean;
  seat?: 0 | 1;
  officialWinner?: boolean;
  pickRule?: PickHighlight | null;
  seatSource?: SeatSource;
};

export function PlayerChip({
  occupant,
  chosen = false,
  grade = null,
  as = "span",
  disabled,
  onClick,
  name,
  value,
  checked,
  seat,
  officialWinner = false,
  pickRule = null,
  seatSource,
}: Props) {
  const t = useT();
  const labels: SeatLabels = {
    notPlayed: t("bracket.notPlayed"),
    tbd: t("draw.tbd"),
    wc: t("draw.entry.wc"),
    pr: t("draw.entry.pr"),
    q: t("draw.entry.q"),
    ll: t("draw.entry.ll"),
    official: t("result.official"),
    winner: t("match.page.winner"),
  };
  const face = seatFace({
    occupant,
    labels,
    chosen,
    grade,
    seat,
    officialWinner,
    pickRule,
    seatSource,
  });

  if (as === "button" && occupant.kind === "player") {
    return (
      <label
        className={face.className}
        data-chosen={chosen ? "true" : "false"}
        {...face.attrs}
      >
        <input
          type="radio"
          className="sr-only"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={() => onClick?.()}
        />
        {face.body}
      </label>
    );
  }

  return (
    <span className={face.className} {...face.attrs}>
      {face.body}
    </span>
  );
}
