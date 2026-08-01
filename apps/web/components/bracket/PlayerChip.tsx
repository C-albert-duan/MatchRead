import type { SlotOccupant } from "@matchread/core";

type Props = {
  occupant: SlotOccupant;
  chosen?: boolean;
  as?: "span" | "button";
  disabled?: boolean;
  onClick?: () => void;
  name?: string;
  value?: string;
  checked?: boolean;
};

function labelFor(occupant: SlotOccupant): {
  text: string;
  seed: string;
  country: string;
  kindClass: string;
} {
  switch (occupant.kind) {
    case "player":
      return {
        text: occupant.lastName,
        seed: occupant.seed != null ? String(occupant.seed) : "",
        country: occupant.countryCode,
        kindClass: "",
      };
    case "bye":
      return { text: "Bye", seed: "", country: "", kindClass: "name--bye" };
    case "dash":
      return { text: "—", seed: "", country: "", kindClass: "name--empty" };
    case "unpicked":
      return {
        text: "Unpicked",
        seed: "",
        country: "",
        kindClass: "name--empty",
      };
  }
}

export function PlayerChip({
  occupant,
  chosen = false,
  as = "span",
  disabled,
  onClick,
  name,
  value,
  checked,
}: Props) {
  const meta = labelFor(occupant);
  const className = [
    "name",
    meta.kindClass,
    chosen ? "name--chosen" : "",
    occupant.kind !== "player" ? "name--placeholder" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <span className="name-seed numeral" aria-hidden={meta.seed ? undefined : true}>
        {meta.seed || "\u00a0"}
      </span>
      <span className="name-text">{meta.text}</span>
      {meta.country ? (
        <span className="name-country">{meta.country}</span>
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
    <span className={className} aria-hidden={occupant.kind === "dash"}>
      {inner}
    </span>
  );
}
