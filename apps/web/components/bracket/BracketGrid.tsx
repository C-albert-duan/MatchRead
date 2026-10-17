"use client";

import { useMemo, type CSSProperties } from "react";
import Link from "next/link";
import {
  buildRoundStructure,
  feederMatchKeys,
  feedsMatchKey,
  resolveMatchEntrants,
  type BracketConfidence,
  type BracketPicks,
  type DrawSeat,
  type OfficialResults,
  type SlotOccupant,
} from "@matchread/core";
import { PlayerChip } from "@/components/bracket/PlayerChip";
import { connectorPair, matchSlotVars } from "@/lib/brackets/layout";
import { matchSheetPresentation, pickHighlight } from "@/lib/brackets/resolution";
import { useT } from "@/components/shell/LocaleProvider";
import {
  matchScheduleCaption,
  type MatchPlayerSide,
  type MatchScheduleRow,
} from "@/lib/tournaments/format";
import { matchHref } from "@/lib/tournaments/href";
import { useViewerTimeZone } from "@/lib/tournaments/viewer-zone";

type Props = {
  drawSize: number;
  seats: DrawSeat[];
  picks: BracketPicks;
  confidence: BracketConfidence;
  locked: boolean;
  /** When set, decided matches show pick vs official winner. */
  official?: OfficialResults;
  schedule?: Record<string, MatchScheduleRow>;
  venueTz?: string;
  locale?: string;
  onPick?: (matchKey: string, playerRef: string) => void;
  onConfidence?: (matchKey: string, level: number) => void;
};

function bothKnown(a: SlotOccupant, b: SlotOccupant): boolean {
  return (
    (a.kind === "player" || a.kind === "bye") &&
    (b.kind === "player" || b.kind === "bye")
  );
}

function refOf(occupant: SlotOccupant): string | null {
  return occupant.kind === "player" ? occupant.ref : null;
}

function seatName(seats: DrawSeat[], ref: string | null): string {
  if (!ref) return "—";
  const seat = seats.find((s) => s.player_id === ref);
  return seat?.last_name ?? ref;
}

function hasBye(a: SlotOccupant, b: SlotOccupant): boolean {
  return a.kind === "bye" || b.kind === "bye";
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

function MatchMeta({
  when,
  place,
  href,
}: {
  when: string | null;
  place: string | null;
  href: string | null;
}) {
  if (!when && !place) return null;
  const body = (
    <>
      {when ? <span className="match-when-line">{when}</span> : null}
      {place ? <span className="match-when-line">{place}</span> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="match-when match-meta numeral">
        {body}
      </Link>
    );
  }
  return <p className="match-when numeral">{body}</p>;
}

type ChipGrade = "correct" | "incorrect" | "voided" | "official" | null;

function chipGrade(input: {
  playerRef: string | null;
  pickRef: string | null;
  officialWinner: string | null;
  voided: boolean;
  graded: boolean;
}): ChipGrade {
  const { playerRef, pickRef, officialWinner, voided, graded } = input;
  if (!graded || !playerRef) return null;
  if (voided) {
    return pickRef === playerRef ? "voided" : null;
  }
  if (officialWinner === playerRef && pickRef === playerRef) return "correct";
  if (pickRef === playerRef && officialWinner !== playerRef) return "incorrect";
  if (officialWinner === playerRef && pickRef !== playerRef) return "official";
  return null;
}

const EMPTY_OFFICIAL: OfficialResults = {};
const EMPTY_SCHEDULE: Record<string, MatchScheduleRow> = {};

export function BracketGrid({
  drawSize,
  seats,
  picks,
  confidence,
  locked,
  official = EMPTY_OFFICIAL,
  schedule = EMPTY_SCHEDULE,
  locale = "en",
  onPick,
  onConfidence,
}: Props) {
  const t = useT();
  const tbc = t("calendar.dateTbc");
  const viewerZone = useViewerTimeZone();
  const rounds = useMemo(() => buildRoundStructure(drawSize), [drawSize]);
  const r0Slots = drawSize / 2;
  const regionStyle = {
    ["--r0-slots"]: String(r0Slots),
    ["--round-count"]: String(rounds.length),
  } as CSSProperties;

  return (
    <div
      className="bracket-region"
      tabIndex={0}
      role="region"
      aria-label="Tournament bracket"
      style={regionStyle}
    >
      <div className="bracket-court" aria-hidden>
        <span className="bracket-court-baseline" />
        <span className="bracket-court-service" />
        <span className="bracket-court-net" />
      </div>
      <div className="bracket-grid bracket-tree">
        {rounds.map((round) => (
          <div
            key={round.index}
            className="bracket-col"
            data-round={round.index}
          >
            <h3 className="bracket-col-head t-caption">
              {round.label.column}
            </h3>
            <div className="bracket-col-body">
              {round.matches.map((match) => {
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
                const feeders = feederMatchKeys(match.round, match.indexInRound);
                const feeds = feedsMatchKey(
                  match.round,
                  match.indexInRound,
                  rounds.length
                );
                const chosen = picks[match.key] ?? null;
                const result = official[match.key];
                const sheet = matchSheetPresentation(result);
                const graded = sheet.state === "official";
                const voided = Boolean(result?.voided);
                const officialWinner = result?.winnerRef ?? null;
                const byeMatch = hasBye(a, b);
                const advancer =
                  byeMatch && a.kind === "player"
                    ? a
                    : byeMatch && b.kind === "player"
                      ? b
                      : null;
                const pickable =
                  !locked &&
                  !graded &&
                  bothKnown(a, b) &&
                  a.kind === "player" &&
                  b.kind === "player";
                const groupName = `match-${match.key}`;
                const unpicked = Boolean(pickable && !chosen);
                const level = confidence[match.key] ?? null;
                const showConfidence = Boolean(chosen) && !graded;
                // Winner chip highlight is enough — no "Won: …" block.
                const showPickGrade =
                  graded && !byeMatch && chosen != null && !voided;
                let gradeLabel: string | null = null;
                if (showPickGrade) {
                  gradeLabel =
                    chosen === officialWinner
                      ? "Correct"
                      : `Miss · ${seatName(seats, officialWinner)}`;
                } else if (graded && voided && chosen != null) {
                  gradeLabel = "Void";
                }

                const ruleFor = (playerRef: string | null) =>
                  pickHighlight(Boolean(playerRef && chosen === playerRef), graded);
                const gradeA = chipGrade({
                  playerRef: refOf(a),
                  pickRef: chosen,
                  officialWinner,
                  voided,
                  graded,
                });
                const gradeB = chipGrade({
                  playerRef: refOf(b),
                  pickRef: chosen,
                  officialWinner,
                  voided,
                  graded,
                });

                const caption = matchScheduleCaption(stored, viewerZone, locale, {
                  tba: t("match.timeTba"),
                  tbc,
                  day: t("match.session.day"),
                  night: t("match.session.night"),
                });
                const publicHref = matchHref(stored?.external_ref);
                const prior = match.round > 0 ? rounds[match.round - 1] : null;
                const feederAria = prior
                  ? `, fed by ${prior.label.match} match ${match.indexInRound * 2 + 1} and ${prior.label.match} match ${match.indexInRound * 2 + 2}`
                  : "";
                const treeAttrs = {
                  "data-feeds": feeds ?? undefined,
                  "data-feeder-a": feeders?.[0],
                  "data-feeder-b": feeders?.[1],
                  "data-session":
                    stored?.session === "day" || stored?.session === "night"
                      ? stored.session
                      : undefined,
                  "data-court": stored?.court ?? undefined,
                };
                const scoreText = sheet.showScore;
                const stateLabel = t(sheet.labelKey);
                const settledWinner = (playerRef: string | null) =>
                  Boolean(
                    graded &&
                      !voided &&
                      officialWinner &&
                      playerRef &&
                      officialWinner === playerRef
                  );
                const withdrawal =
                  result?.factKind === "withdrawal" && !byeMatch;

                if (byeMatch && advancer) {
                  return (
                    <div
                      key={match.key}
                      className="match-cell match-cell--bye"
                      data-match-key={match.key}
                      data-round={match.round}
                      data-index={match.indexInRound}
                      data-pair={connectorPair(match.indexInRound)}
                      data-has-winner="true"
                      style={matchSlotVars(match.round, match.indexInRound)}
                      {...treeAttrs}
                    >
                      <div
                        className="slot slot--bye"
                        role="group"
                        aria-label={`${advancer.lastName} advances (bye)${feederAria}`}
                      >
                        <PlayerChip
                          occupant={advancer}
                          grade="official"
                          seat={0}
                        />
                        <span className="bye-tag">Bye · advances</span>
                      </div>
                      <MatchMeta when={caption.when} place={caption.place} href={publicHref} />
                    </div>
                  );
                }

                const resultTone = graded
                  ? voided
                    ? "voided"
                    : chosen && chosen === officialWinner
                      ? "correct"
                      : chosen
                        ? "incorrect"
                        : "result"
                  : undefined;

                return (
                  <div
                    key={match.key}
                    className="match-cell"
                    data-match-key={match.key}
                    data-round={match.round}
                    data-index={match.indexInRound}
                    data-pair={connectorPair(match.indexInRound)}
                    data-resolution={sheet.state}
                    data-settled={graded ? "true" : undefined}
                    data-fact-kind={result?.factKind || undefined}
                    data-has-winner={officialWinner ? "true" : undefined}
                    style={matchSlotVars(match.round, match.indexInRound)}
                    {...treeAttrs}
                  >
                    <div
                      className="slot"
                      role="radiogroup"
                      aria-label={`${round.label.match} match ${match.indexInRound + 1}, ${stateLabel}${feederAria}${unpicked ? ", unpicked" : ""}${
                        officialWinner
                          ? `, won by ${seatName(seats, officialWinner)}`
                          : ""
                      }`}
                      data-unpicked={unpicked ? "true" : undefined}
                      data-confidence={showConfidence ? "true" : undefined}
                      data-graded={resultTone}
                    >
                      {pickable ? (
                        <>
                          <PlayerChip
                            as="button"
                            occupant={a}
                            chosen={chosen === refOf(a)}
                            name={groupName}
                            value={refOf(a) ?? ""}
                            checked={chosen === refOf(a)}
                            seat={0}
                            pickRule={ruleFor(refOf(a))}
                            officialWinner={settledWinner(refOf(a))}
                            onClick={() =>
                              a.kind === "player" &&
                              onPick?.(match.key, a.ref)
                            }
                          />
                          <PlayerChip
                            as="button"
                            occupant={b}
                            chosen={chosen === refOf(b)}
                            name={groupName}
                            value={refOf(b) ?? ""}
                            checked={chosen === refOf(b)}
                            seat={1}
                            pickRule={ruleFor(refOf(b))}
                            officialWinner={settledWinner(refOf(b))}
                            onClick={() =>
                              b.kind === "player" &&
                              onPick?.(match.key, b.ref)
                            }
                          />
                        </>
                      ) : (
                        <>
                          <PlayerChip
                            occupant={a}
                            chosen={a.kind === "player" && chosen === a.ref}
                            grade={gradeA}
                            seat={0}
                            pickRule={ruleFor(refOf(a))}
                            officialWinner={settledWinner(refOf(a))}
                          />
                          <PlayerChip
                            occupant={b}
                            chosen={b.kind === "player" && chosen === b.ref}
                            grade={gradeB}
                            seat={1}
                            pickRule={ruleFor(refOf(b))}
                            officialWinner={settledWinner(refOf(b))}
                          />
                        </>
                      )}
                    </div>
                    {showConfidence ? (
                      <div
                        className="confidence-row"
                        role="group"
                        aria-label={`Confidence for ${round.label.match} match ${match.indexInRound + 1}`}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="confidence-btn"
                            data-active={level === n ? "true" : undefined}
                            disabled={locked}
                            aria-pressed={level === n}
                            aria-label={`Confidence ${n} of 5`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onConfidence?.(match.key, n);
                            }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {gradeLabel ? (
                      <div className="grade-row" aria-hidden="true">
                        {gradeLabel}
                      </div>
                    ) : null}
                    <p className="match-state numeral">{stateLabel}</p>
                    {scoreText ? (
                      <p className="match-score numeral">{scoreText}</p>
                    ) : null}
                    {withdrawal ? (
                      <p className="match-fact">{t("match.withdrawal")}</p>
                    ) : null}
                    <MatchMeta when={caption.when} place={caption.place} href={publicHref} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
