import type { CSSProperties } from "react";
import Link from "next/link";
import type { DrawSeat, OfficialResults, SlotOccupant } from "@matchread/core";
import { isLocale, t as translate, type MessageKey } from "@matchread/i18n";
import { BracketScroller } from "@/components/bracket/BracketScroller";
import { SeatName, type SeatLabels } from "@/components/bracket/SeatName";
import {
  connectorPair,
  matchSlotVars,
  relevantRoundIndex,
} from "@/lib/brackets/layout";
import { buildViewerNodes } from "@/lib/brackets/viewer-tree";
import {
  hasPublishedClock,
  matchScheduleCaption,
  type MatchScheduleRow,
} from "@/lib/tournaments/format";
import { matchHref } from "@/lib/tournaments/href";

type Props = {
  drawSize: number;
  seats: DrawSeat[];
  official: OfficialResults;
  schedule: Record<string, MatchScheduleRow>;
  tournamentId: string;
  tournamentRef: string;
  locale?: string;
};

function refOf(occupant: SlotOccupant): string | null {
  return occupant.kind === "player" ? occupant.ref : null;
}

function sideName(occupant: SlotOccupant): string | null {
  return occupant.kind === "player" ? occupant.lastName : null;
}

function label(locale: string, key: MessageKey): string {
  return translate(isLocale(locale) ? locale : "en", key);
}

/** Public draw: round columns, feeders, and stored results. No pick controls. */
export function BracketTree({
  drawSize,
  seats,
  official,
  schedule,
  tournamentId,
  tournamentRef,
  locale = "en",
}: Props) {
  const nodes = buildViewerNodes(drawSize, seats, official, schedule);
  const rounds = nodes.reduce<
    { index: number; title: string; keys: string[] }[]
  >((list, node) => {
    const last = list[list.length - 1];
    if (!last || last.index !== node.round) {
      list.push({ index: node.round, title: node.column, keys: [node.key] });
    } else {
      last.keys.push(node.key);
    }
    return list;
  }, []);
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const relevantRound = relevantRoundIndex(
    rounds.map((round) => ({
      round: round.index,
      official: round.keys.every((key) => byKey.get(key)?.state === "official"),
    }))
  );
  const copy = {
    tba: label(locale, "match.timeTba"),
    tbc: label(locale, "calendar.dateTbc"),
    day: label(locale, "match.session.day"),
    night: label(locale, "match.session.night"),
  };
  const seatLabels: SeatLabels = {
    notPlayed: label(locale, "bracket.notPlayed"),
    tbd: label(locale, "draw.tbd"),
    wc: label(locale, "draw.entry.wc"),
    pr: label(locale, "draw.entry.pr"),
    q: label(locale, "draw.entry.q"),
    ll: label(locale, "draw.entry.ll"),
    official: label(locale, "result.official"),
    winner: label(locale, "match.page.winner"),
  };
  const regionStyle = {
    "--round-span": String(Math.max(rounds[0]?.keys.length ?? 1, 1)),
    "--r0-slots": String(Math.max(rounds[0]?.keys.length ?? 1, 1)),
    "--round-count": String(rounds.length),
  } as CSSProperties;

  return (
    <BracketScroller
      relevantRound={relevantRound}
      label={label(locale, "publicTournament.officialDraw")}
      locale={locale}
      tba={copy.tba}
      tbc={copy.tbc}
    >
      <div className="bracket-region" style={regionStyle}>
        <div className="bracket-grid bracket-tree">
          {rounds.map((round) => {
            const roundId = `bracket-round-${round.index}`;
            return (
            <section
              key={round.index}
              className="bracket-col"
              data-round={round.index}
              aria-labelledby={roundId}
            >
              <h3 id={roundId} className="bracket-col-head t-caption">
                {round.title}
              </h3>
              <ol className="bracket-col-body">
                {round.keys.map((key) => {
                  const node = byKey.get(key);
                  if (!node) return null;
                  const caption = matchScheduleCaption(
                    {
                      scheduled_at: node.scheduledAt,
                      has_time: node.hasTime,
                      session: node.session,
                      court: node.court,
                    },
                    null,
                    locale,
                    copy
                  );
                  const timed = hasPublishedClock({
                    scheduled_at: node.scheduledAt,
                    has_time: node.hasTime,
                  });
                  const href = matchHref(node.externalRef);
                  const publicRef = href ? node.externalRef?.trim() : null;
                  const stateLabel =
                    node.state === "official"
                      ? label(locale, "result.official")
                      : label(locale, "match.scheduled");
                  const winnerName =
                    sideName(node.a) && node.winnerRef === refOf(node.a)
                      ? sideName(node.a)
                      : sideName(node.b) && node.winnerRef === refOf(node.b)
                        ? sideName(node.b)
                        : null;
                  const fedBy = node.feeders
                    ?.map((feederKey) => byKey.get(feederKey))
                    .filter((feeder) => feeder != null)
                    .map(
                      (feeder) =>
                        `${feeder.matchLabel} match ${feeder.indexInRound + 1}`
                    );
                  const scheduleLines = (
                    <>
                      {timed ? (
                        <span
                          className="match-when-line"
                          data-clock={node.scheduledAt}
                          data-has-time="true"
                        >
                          {copy.tba}
                        </span>
                      ) : caption.when ? (
                        <span className="match-when-line">{caption.when}</span>
                      ) : null}
                      {caption.place ? (
                        <span className="match-when-line">{caption.place}</span>
                      ) : null}
                    </>
                  );
                  const showSchedule = timed || caption.when || caption.place;
                  return (
                    <li
                      key={node.key}
                      className="match-cell"
                      data-match-key={node.key}
                      data-public-ref={publicRef ?? undefined}
                      data-tournament-id={tournamentId}
                      data-tournament-ref={tournamentRef}
                      data-round={node.round}
                      data-index={node.indexInRound}
                      data-resolution={node.state}
                      data-base-resolution={node.state}
                      data-settled={node.state === "official" ? "true" : undefined}
                      data-fact-kind={node.factKind || undefined}
                      data-has-winner={node.winnerRef ? "true" : undefined}
                      data-pair={connectorPair(node.indexInRound)}
                      data-feeds={node.feeds ?? undefined}
                      data-feeder-a={node.feeders?.[0]}
                      data-feeder-b={node.feeders?.[1]}
                      data-session={node.session ?? undefined}
                      data-court={node.court ?? undefined}
                      style={matchSlotVars(node.round, node.indexInRound)}
                    >
                      <div
                        className="slot"
                        role="group"
                        aria-label={`${node.matchLabel} match ${node.indexInRound + 1}, ${stateLabel}${
                          fedBy?.length === 2 ? `, fed by ${fedBy[0]} and ${fedBy[1]}` : ""
                        }${winnerName ? `, ${seatLabels.winner} ${winnerName}` : ""}`}
                      >
                        <SeatName
                          occupant={node.a}
                          labels={seatLabels}
                          seat={0}
                          seatSource={node.aSource}
                          officialWinner={
                            Boolean(node.winnerRef) &&
                            node.winnerRef === refOf(node.a)
                          }
                        />
                        <SeatName
                          occupant={node.b}
                          labels={seatLabels}
                          seat={1}
                          seatSource={node.bSource}
                          officialWinner={
                            Boolean(node.winnerRef) &&
                            node.winnerRef === refOf(node.b)
                          }
                        />
                      </div>
                      <p className="match-state numeral">{stateLabel}</p>
                      <p className="match-live" data-live-root hidden />
                      {node.score ? (
                        <p className="match-score numeral">{node.score}</p>
                      ) : null}
                      {node.factKind === "withdrawal" ? (
                        <p className="match-fact">{label(locale, "match.withdrawal")}</p>
                      ) : null}
                      {showSchedule ? (
                        href ? (
                          <Link href={href} className="match-when match-meta numeral">
                            {scheduleLines}
                          </Link>
                        ) : (
                          <p className="match-when numeral">{scheduleLines}</p>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
            );
          })}
        </div>
      </div>
    </BracketScroller>
  );
}
