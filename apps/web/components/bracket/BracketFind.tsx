"use client";

import { useMemo, useState } from "react";
import {
  applyByeAdvances,
  buildRoundStructure,
  resolveMatchEntrants,
  type BracketPicks,
  type DrawSeat,
  type OfficialResults,
} from "@matchread/core";
import { useT } from "@/components/shell/LocaleProvider";
import {
  formatMatchWhen,
  type MatchScheduleRow,
} from "@/lib/tournaments/format";

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

export function BracketFind({
  drawSize,
  seats,
  picks,
  official,
  schedule,
  venueTz,
  locale,
}: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const tbc = t("calendar.dateTbc");

  const displayPicks = useMemo(() => {
    const merged: BracketPicks = { ...picks };
    for (const [key, result] of Object.entries(official)) {
      if (result?.winnerRef && !result.voided) merged[key] = result.winnerRef;
    }
    return applyByeAdvances(seats, merged, drawSize);
  }, [picks, official, seats, drawSize]);

  const rows = useMemo(() => {
    return buildRoundStructure(drawSize).flatMap((round) =>
      round.matches.map((match) => {
        const [a, b] = resolveMatchEntrants(
          seats,
          displayPicks,
          match.round,
          match.indexInRound
        );
        const left = occupantLabel(a);
        const right = occupantLabel(b);
        const title =
          left && right
            ? `${left} · ${right}`
            : left || right || t("bracket.notPlayed");
        return {
          key: match.key,
          round: round.label.column,
          title,
          haystack: `${left} ${right} ${round.label.column}`.toLowerCase(),
          when: formatMatchWhen(schedule[match.key], venueTz, locale, tbc),
        };
      })
    );
  }, [drawSize, seats, displayPicks, schedule, venueTz, locale, t, tbc]);

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
                <span className="bracket-find-when numeral">{row.when}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
