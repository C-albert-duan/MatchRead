"use client";

import { useMemo, useState } from "react";
import {
  buildRoundStructure,
  resolveMatchEntrants,
  type BracketPicks,
  type DrawSeat,
  type SlotOccupant,
} from "@matchread/core";
import {
  clearOfficialResults,
  saveOfficialWinner,
  settleAllLeaguesForTournament,
} from "@/app/actions/settlement";
import { useLocale, useT, useTf } from "@/components/shell/LocaleProvider";
import {
  formatMatchWhen,
  type MatchScheduleRow,
} from "@/lib/tournaments/format";

type Props = {
  leagueId: string;
  leagueSlug: string;
  tournamentId: string;
  tournamentRef: string;
  drawSize: number;
  seats: DrawSeat[];
  /** Existing official winners: matchKey → player_id */
  initialResults: Record<string, string>;
  isFounder: boolean;
  schedule?: Record<string, MatchScheduleRow>;
  venueTz?: string;
};

type Busy =
  | { kind: "save"; matchKey: string }
  | { kind: "clear"; matchKey?: string }
  | { kind: "settle" }
  | null;

function labelFor(
  occupant: SlotOccupant,
  t: (key: import("@matchread/i18n").MessageKey) => string
): string {
  if (occupant.kind === "player") {
    const seed = occupant.seed != null ? `(${occupant.seed}) ` : "";
    return `${seed}${occupant.lastName}`;
  }
  if (occupant.kind === "bye") return t("results.bye");
  if (occupant.kind === "unpicked") return t("results.tbd");
  return "—";
}

/** Keys for this match plus every later round (depend on earlier winners). */
function keysFromRoundOnward(drawSize: number, fromRound: number): string[] {
  return buildRoundStructure(drawSize)
    .filter((r) => r.index >= fromRound)
    .flatMap((r) => r.matches.map((m) => m.key));
}

export function OfficialResultsPanel({
  leagueId,
  leagueSlug,
  tournamentId,
  tournamentRef,
  drawSize,
  seats,
  initialResults,
  isFounder,
  schedule = {},
  venueTz = "UTC",
}: Props) {
  const [results, setResults] = useState<Record<string, string>>(initialResults);
  const [message, setMessage] = useState<string | null>(null);
  const [activeRound, setActiveRound] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);

  const rounds = useMemo(() => buildRoundStructure(drawSize), [drawSize]);
  const officialAsPicks = results as BracketPicks;
  const panelBusy = busy != null;
  const t = useT();
  const tf = useTf();
  const locale = useLocale();
  const tbc = t("calendar.dateTbc");

  async function saveWinner(
    matchKey: string,
    roundIndex: number,
    winnerRef: string,
    winnerName: string
  ) {
    if (busy) return;
    if (results[matchKey] === winnerRef) return;

    // Only clear later rounds that actually have a recorded winner.
    const laterKeys = keysFromRoundOnward(drawSize, roundIndex + 1).filter(
      (k) => results[k]
    );

    // Optimistic update — UI stays responsive while the server catches up.
    const snapshot = results;
    setResults((prev) => {
      const next = { ...prev };
      for (const k of laterKeys) delete next[k];
      next[matchKey] = winnerRef;
      return next;
    });
    setBusy({ kind: "save", matchKey });
    setMessage(t("results.busy.save"));

    const result = await saveOfficialWinner({
      leagueId,
      leagueSlug,
      tournamentId,
      tournamentRef,
      matchKey,
      winnerRef,
      clearMatchKeys: laterKeys,
    });

    setBusy(null);
    if (!result.ok) {
      setResults(snapshot);
      setMessage(result.error);
      return;
    }

    setMessage(
      laterKeys.length > 0
        ? tf("results.msg.savedCleared", { name: winnerName })
        : tf("results.msg.saved", { name: winnerName })
    );
  }

  async function clearMatch(matchKey: string, roundIndex: number) {
    if (busy) return;
    const toClear = [
      matchKey,
      ...keysFromRoundOnward(drawSize, roundIndex + 1).filter((k) => results[k]),
    ];
    const snapshot = results;
    setResults((prev) => {
      const next = { ...prev };
      for (const k of toClear) delete next[k];
      return next;
    });
    setBusy({ kind: "clear", matchKey });
    setMessage(t("results.busy.clear"));

    const result = await clearOfficialResults({
      leagueId,
      leagueSlug,
      tournamentId,
      tournamentRef,
      matchKeys: toClear,
    });

    setBusy(null);
    if (!result.ok) {
      setResults(snapshot);
      setMessage(result.error);
      return;
    }
    setMessage(t("results.msg.cleared"));
  }

  async function clearAll() {
    if (busy) return;
    const snapshot = results;
    setResults({});
    setBusy({ kind: "clear" });
    setMessage(t("results.busy.clear"));

    const result = await clearOfficialResults({
      leagueId,
      leagueSlug,
      tournamentId,
      tournamentRef,
    });

    setBusy(null);
    if (!result.ok) {
      setResults(snapshot);
      setMessage(result.error);
      return;
    }
    setMessage(t("results.msg.clearedAll"));
  }

  async function settleAll() {
    if (busy) return;
    setBusy({ kind: "settle" });
    setMessage(t("results.busy.settle"));
    const result = await settleAllLeaguesForTournament({
      tournamentId,
      tournamentRef,
    });
    setBusy(null);
    setMessage(result.ok ? tf("settle.ok", { n: result.graded }) : result.error);
  }

  const round = rounds[activeRound] ?? rounds[0];
  const recordedCount = Object.keys(results).length;
  const total = drawSize - 1;

  const busyLabel =
    busy?.kind === "save"
      ? t("results.busy.save")
      : busy?.kind === "clear"
        ? t("results.busy.clear")
        : busy?.kind === "settle"
          ? t("results.busy.settle")
          : null;

  return (
    <section
      className="panel stack gap-lg"
      aria-labelledby="official-results"
      aria-busy={panelBusy}
    >
      <div className="stack gap-sm">
        <h2 id="official-results" className="section-title">
          {t("results.title")}
        </h2>
        <p className="t-body">{t("results.lede")}</p>
        <p className="t-caption numeral">
          {tf("results.recorded", { n: recordedCount, total })}
        </p>
      </div>

      {busyLabel ? (
        <div className="results-busy" role="status" aria-live="polite">
          <span className="results-busy-dot" aria-hidden />
          {busyLabel}
        </div>
      ) : null}

      <div className="result-round-tabs" role="tablist" aria-label="Rounds">
        {rounds.map((r) => {
          const done =
            r.matches.length > 0 && r.matches.every((m) => results[m.key]);
          const partial = r.matches.some((m) => results[m.key]);
          return (
            <button
              key={r.index}
              type="button"
              role="tab"
              aria-selected={activeRound === r.index}
              className={
                activeRound === r.index
                  ? "result-round-tab result-round-tab--active"
                  : "result-round-tab"
              }
              onClick={() => setActiveRound(r.index)}
            >
              {r.label.column}
              {done
                ? ` · ${t("results.done")}`
                : partial
                  ? ` · ${t("results.inProgress")}`
                  : ""}
            </button>
          );
        })}
      </div>

      {round ? (
        <ul className="result-match-list">
          {round.matches.map((match) => {
            const [a, b] = resolveMatchEntrants(
              seats,
              officialAsPicks,
              match.round,
              match.indexInRound
            );
            const winner = results[match.key];
            const players = [a, b].filter(
              (o): o is Extract<SlotOccupant, { kind: "player" }> =>
                o.kind === "player"
            );
            const ready =
              players.length >= 1 &&
              a.kind !== "dash" &&
              b.kind !== "dash" &&
              a.kind !== "unpicked" &&
              b.kind !== "unpicked";
            const matchBusy =
              busy?.kind === "save" && busy.matchKey === match.key;

            return (
              <li
                key={match.key}
                className={
                  matchBusy ? "result-match result-match--busy" : "result-match"
                }
              >
                <div className="row between wrap gap-sm">
                  <p className="result-match-label">
                    {round.label.match} {match.indexInRound + 1}
                    {" · "}
                    <span className="numeral">
                      {formatMatchWhen(
                        schedule[match.key],
                        venueTz,
                        locale,
                        tbc
                      )}
                    </span>
                    {matchBusy ? (
                      <span className="result-match-pending">
                        {" "}
                        · {t("results.busy.save")}
                      </span>
                    ) : winner ? (
                      <span className="result-match-saved">
                        {" "}
                        · {t("results.saved")}
                      </span>
                    ) : (
                      <span className="result-match-pending">
                        {" "}
                        · {t("results.notPlayed")}
                      </span>
                    )}
                  </p>
                  {winner ? (
                    <button
                      type="button"
                      className="act act--quiet"
                      disabled={panelBusy}
                      onClick={() => void clearMatch(match.key, match.round)}
                    >
                      {t("results.clear")}
                    </button>
                  ) : null}
                </div>
                {!ready ? (
                  <p className="t-caption">{t("results.waitingEarlier")}</p>
                ) : (
                  <div className="result-match-choices">
                    {players.flatMap((p, i) => {
                      const btn = (
                        <button
                          key={p.ref}
                          type="button"
                          className={
                            winner === p.ref
                              ? "result-pick result-pick--won"
                              : "result-pick"
                          }
                          disabled={panelBusy}
                          aria-pressed={winner === p.ref}
                          onClick={() =>
                            void saveWinner(
                              match.key,
                              match.round,
                              p.ref,
                              labelFor(p, t)
                            )
                          }
                        >
                          {labelFor(p, t)}
                        </button>
                      );
                      if (i === 0) return [btn];
                      return [
                        <span
                          key={`vs-${p.ref}`}
                          className="result-vs"
                          aria-hidden
                        >
                          {t("results.vs")}
                        </span>,
                        btn,
                      ];
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="page-actions">
        {recordedCount > 0 ? (
          <button
            type="button"
            className="act act--standard act--standard-size"
            disabled={panelBusy}
            onClick={() => void clearAll()}
          >
            {t("results.clearAll")}
          </button>
        ) : null}
        {isFounder ? (
          <button
            type="button"
            className="act act--standard act--standard-size"
            disabled={panelBusy}
            onClick={() => void settleAll()}
          >
            {busy?.kind === "settle"
              ? t("results.settling")
              : t("results.settleAll")}
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="hint" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
