"use client";

import type { SlotOccupant } from "@matchread/core";
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
};

function labelFor(
  occupant: SlotOccupant,
  t: (key: "bracket.notPlayed" | "draw.tbd" | "draw.entry.wc" | "draw.entry.pr") => string
): {
  text: string;
  seed: string;
  country: string;
  entry: string;
  kindClass: string;
} {
  switch (occupant.kind) {
    case "player": {
      const tag =
        occupant.entryStatus === "wc"
          ? t("draw.entry.wc")
          : occupant.entryStatus === "pr"
            ? t("draw.entry.pr")
            : "";
      return {
        text: occupant.lastName,
        seed: occupant.seed != null ? String(occupant.seed) : "",
        country: occupant.countryCode,
        entry: tag,
        kindClass: "",
      };
    }
    case "bye":
      return { text: "Bye", seed: "", country: "", entry: "", kindClass: "name--bye" };
    case "tbd":
      return {
        text: t("draw.tbd"),
        seed: "",
        country: "",
        entry: "",
        kindClass: "name--tbd",
      };
    case "dash":
      return {
        text: t("bracket.notPlayed"),
        seed: "",
        country: "",
        entry: "",
        kindClass: "name--empty",
      };
    case "unpicked":
      return {
        text: "Unpicked",
        seed: "",
        country: "",
        entry: "",
        kindClass: "name--empty",
      };
  }
}

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
}: Props) {
  const t = useT();
  const meta = labelFor(occupant, t);
  const className = [
    "name",
    meta.kindClass,
    chosen && !grade ? "name--chosen" : "",
    grade === "correct" ? "name--correct" : "",
    grade === "incorrect" ? "name--incorrect" : "",
    grade === "voided" ? "name--voided" : "",
    grade === "official" ? "name--official" : "",
    occupant.kind !== "player" ? "name--placeholder" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <span
        className="name-seed numeral"
        aria-hidden={meta.seed ? undefined : true}
      >
        {meta.seed || "\u00a0"}
      </span>
      <span className="name-text">{meta.text}</span>
      {meta.country ? (
        <span className="name-country">{meta.country}</span>
      ) : null}
      {meta.entry ? (
        <span className="name-entry">{meta.entry}</span>
      ) : null}
    </>
  );

  if (as === "button" && occupant.kind === "player") {
    return (
      <label className={className} data-chosen={chosen ? "true" : "false"}>
        <input
          type="radio"
          className="sr-only"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={() => onClick?.()}
        />
        {inner}
      </label>
    );
  }

  return (
    <span className={className}>
      {inner}
    </span>
  );
}
