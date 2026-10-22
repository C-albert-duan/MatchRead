import type { ReactNode } from "react";
import type { SlotOccupant } from "@matchread/core";
import type { PickHighlight, SeatSource } from "@/lib/brackets/resolution";

type GradeTone = "correct" | "incorrect" | "voided" | "official" | null;

export type SeatLabels = {
  notPlayed: string;
  tbd: string;
  wc: string;
  pr: string;
  q: string;
  ll: string;
  official: string;
  winner: string;
};

type Props = {
  occupant: SlotOccupant;
  labels: SeatLabels;
  chosen?: boolean;
  grade?: GradeTone;
  seat?: 0 | 1;
  officialWinner?: boolean;
  pickRule?: PickHighlight | null;
  seatSource?: SeatSource;
};

function labelFor(occupant: SlotOccupant, labels: SeatLabels) {
  switch (occupant.kind) {
    case "player": {
      const entry =
        occupant.entryStatus === "wc"
          ? labels.wc
          : occupant.entryStatus === "pr"
            ? labels.pr
            : occupant.entryStatus === "q"
              ? labels.q
              : occupant.entryStatus === "ll"
                ? labels.ll
                : "";
      return {
        text: occupant.lastName,
        seed: occupant.seed != null ? String(occupant.seed) : "",
        country: occupant.countryCode,
        entry,
        kindClass: "",
      };
    }
    case "bye":
      return { text: "Bye", seed: "", country: "", entry: "", kindClass: "name--bye" };
    case "tbd":
      return { text: labels.tbd, seed: "", country: "", entry: "", kindClass: "name--tbd" };
    case "dash":
      return {
        text: labels.notPlayed,
        seed: "",
        country: "",
        entry: "",
        kindClass: "name--empty",
      };
    case "unpicked":
      return { text: "Unpicked", seed: "", country: "", entry: "", kindClass: "name--empty" };
  }
}

export function seatFace({
  occupant,
  labels,
  chosen = false,
  grade = null,
  seat,
  officialWinner = false,
  pickRule = null,
  seatSource,
}: Props): { className: string; attrs: Record<string, string>; body: ReactNode } {
  const meta = labelFor(occupant, labels);
  const playerRef = occupant.kind === "player" ? occupant.ref : undefined;
  const attrs: Record<string, string> = {};
  if (seat != null) attrs["data-seat"] = String(seat);
  if (playerRef) attrs["data-player-ref"] = playerRef;
  if (officialWinner) attrs["data-official-winner"] = "true";
  if (pickRule) attrs["data-pick-rule"] = pickRule;
  if (seatSource) attrs["data-seat-source"] = seatSource;
  return {
    className: [
      "name",
      meta.kindClass,
      chosen && !grade ? "name--chosen" : "",
      grade === "correct" ? "name--correct" : "",
      grade === "incorrect" ? "name--incorrect" : "",
      grade === "voided" ? "name--voided" : "",
      grade === "official" || officialWinner ? "name--official" : "",
      occupant.kind !== "player" ? "name--placeholder" : "",
    ]
      .filter(Boolean)
      .join(" "),
    attrs,
    body: (
      <>
        <span className="name-seed numeral" aria-hidden={meta.seed ? undefined : true}>
          {meta.seed || "\u00a0"}
        </span>
        <span className="name-text">{meta.text}</span>
        {meta.country ? <span className="name-country">{meta.country}</span> : null}
        {meta.entry ? <span className="name-entry">{meta.entry}</span> : null}
        {officialWinner ? (
          <span className="bye-tag name-win">{labels.winner}</span>
        ) : null}
      </>
    ),
  };
}

/** Static seat markup. The editor wraps it; the public sheet renders it on the server. */
export function SeatName(props: Props) {
  const face = seatFace(props);
  return (
    <span className={face.className} {...face.attrs}>
      {face.body}
    </span>
  );
}
