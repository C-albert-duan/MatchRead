"use client";

import { useMemo, useState } from "react";
import {
  buildRoundStructure,
  resolveMatchEntrants,
  type BracketPicks,
  type DrawSeat,
  type OfficialResults,
  type SlotOccupant,
} from "@matchread/core";
import { useT } from "@/components/shell/LocaleProvider";
import {
  matchScheduleCaption,
  type MatchPlayerSide,
  type MatchScheduleRow,
} from "@/lib/tournaments/format";
import { useViewerTimeZone } from "@/lib/tournaments/viewer-zone";

type Props = {
  drawSize: number;
  seats: DrawSeat[];
  picks: BracketPicks;
  official: OfficialResults;
  schedule: Record<string, MatchScheduleRow>;
  venueTz: string;
  locale: string;
};

function occupantLabel(occupant: { kind: string; lastName?: string }) {
  if (occupant.kind === "player" && occupant.lastName) return occupant.lastName;
  if (occupant.kind === "bye") return "Bye";
  return "";
}

function storedSide(
  side: MatchPlayerSide | null | undefined,
  fallback: SlotOccupant
): SlotOccupant {
  if (!side?.ref) return fallback;
  return {
    kind: "player",
    ref: side.ref,
    lastName: side.lastName,
    seed: side.seed,
    countryCode: side.countryCode,
  };
}

export function BracketFind({
  drawSize,
  seats,
  picks,
  schedule,
  locale,
}: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const tbc = t("calendar.dateTbc");
  const viewerZone = useViewerTimeZone();

  const rows = useMemo(() => {
    return buildRoundStructure(drawSize).flatMap((round) =>
      round.matches.map((match) => {
        const predicted = resolveMatchEntrants(
          seats,
          match.round === 0 ? {} : picks,
          match.round,
          match.indexInRound
        );
        const stored = schedule[match.key];
        const [a, b] =
          match.round === 0
            ? predicted
            : [
                storedSide(stored?.side_a, predicted[0]),
                storedSide(stored?.side_b, predicted[1]),
              ];
        const left = occupantLabel(a);
        const right = occupantLabel(b);
        const title =
          left && right
            ? `${left} · ${right}`
            : left || right || t("bracket.notPlayed");
        const caption = matchScheduleCaption(stored, viewerZone, locale, {
          tba: t("match.timeTba"),
          tbc,
          day: t("match.session.day"),
          night: t("match.session.night"),
        });
        return {
          key: match.key,
          round: round.label.column,
          title,
          haystack: `${left} ${right} ${round.label.column}`.toLowerCase(),
          when: caption.when,
          place: caption.place,
        };
      })
    );
  }, [drawSize, seats, picks, schedule, viewerZone, locale, t, tbc]);

  const needle = query.trim().toLowerCase();
  const ready = needle.length >= 2;
  const hits = ready ? rows.filter((row) => row.haystack.includes(needle)) : [];

  function jumpTo(matchKey: string) {
    const el = document.querySelector(`[data-match-key="${matchKey}"]`);
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    el.setAttribute("data-find-hit", "true");
    window.setTimeout(() => el.removeAttribute("data-find-hit"), 1600);
  }

  return (
    <div className="bracket-find">
      <label className="stack gap-sm">
        <span className="field-label">{t("bracket.find.label")}</span>
        <input
          type="search"
          className="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("bracket.find.placeholder")}
          autoComplete="off"
        />
      </label>
      {!ready ? (
        <p className="t-caption">{t("bracket.find.hint")}</p>
      ) : hits.length === 0 ? (
        <p className="t-caption">{t("bracket.find.empty")}</p>
      ) : (
        <ul className="bracket-find-list">
          {hits.slice(0, 12).map((row) => (
            <li key={row.key}>
              <button
                type="button"
                className="bracket-find-row"
                onClick={() => jumpTo(row.key)}
              >
                <span className="bracket-find-round numeral">{row.round}</span>
                <span className="bracket-find-names">{row.title}</span>
                <span className="bracket-find-when numeral">
                  {row.when ? <span className="match-when-line">{row.when}</span> : null}
                  {row.place ? <span className="match-when-line">{row.place}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
