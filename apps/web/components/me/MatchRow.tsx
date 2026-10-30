import Link from "next/link";
import { getLocale, t, tf } from "@/lib/i18n";
import type { MyMatchRow } from "@/lib/me/my-tennis";
import { reasonMessage } from "@/lib/me/reason-text";
import { matchScheduleCaption } from "@/lib/tournaments/format";
import { matchHref } from "@/lib/tournaments/href";

type Props = {
  row: MyMatchRow;
  names: Readonly<Record<string, string>>;
  /** Stage variant: names at display size. Same live hooks as a list row. */
  size?: "row" | "stage";
};

/**
 * One match the user has a stake in: why it matters, both players, the
 * score, one line of consequence. A row, not a card. The global live layer
 * patches the score through `data-live-root`; the server score below is the
 * first paint and hides once that layer has painted.
 */
export function MatchRow({ row, names, size = "row" }: Props) {
  const locale = getLocale();
  const reason = row.consequence.reasons[0];
  const sentence = reason ? reasonMessage(reason, names) : null;
  const href = matchHref(row.matchRef);
  const official = row.status === "final";
  const caption = matchScheduleCaption(
    {
      scheduled_at: row.startsAt,
      has_time: row.hasTime,
      session: row.session,
      court: row.court,
    },
    null,
    locale,
    {
      tba: t("match.timeTba"),
      tbc: t("calendar.dateTbc"),
      day: t("match.session.day"),
      night: t("match.session.night"),
    }
  );
  const timed = row.hasTime && row.startsAt ? row.startsAt : undefined;
  const score = official ? row.officialScore : row.live?.sets?.replaceAll(",", " ") ?? null;
  const delta = row.consequence.ceilingDeltaIfLost;

  return (
    <article
      className={`match-cell my-row my-row--${size}`}
      data-public-ref={row.matchRef}
      data-tournament-id={row.tournamentId}
      data-tournament-ref={row.tournamentRef}
      data-base-resolution={official ? "official" : "scheduled"}
      data-resolution={official ? "official" : row.status === "live" ? "live" : "scheduled"}
      data-importance={row.consequence.importance}
    >
      {sentence ? (
        <p className="my-row-reason">{tf(sentence.key, sentence.vars)}</p>
      ) : null}
      <p className="my-row-players">
        <Player name={row.sideA?.lastName} picked={row.pickRef === row.sideA?.ref} won={official && row.winnerRef === row.sideA?.ref} />
        <span className="my-row-vs">{t("results.vs")}</span>
        <Player name={row.sideB?.lastName} picked={row.pickRef === row.sideB?.ref} won={official && row.winnerRef === row.sideB?.ref} />
      </p>
      <div className="my-row-meta">
        {score ? (
          <span className="my-row-score numeral" data-score-static={official ? undefined : ""}>
            {official ? `${t("me.final")} · ${score}` : score}
          </span>
        ) : null}
        <span className="match-live" data-live-root hidden />
        <span className="t-caption numeral my-row-when">
          <span data-clock={timed}>{caption.when ?? ""}</span>
          {caption.place ? <span> · {caption.place}</span> : null}
        </span>
      </div>
      <p className="t-caption my-row-foot">
        {delta > 0 && !official ? <span>{tf("me.atStake", { n: delta })}</span> : null}
        <span>{row.tournamentName}</span>
        {href ? (
          <Link href={href} className="text-link">
            {t("me.detail")}
          </Link>
        ) : null}
      </p>
    </article>
  );
}

function Player({ name, picked, won }: { name?: string; picked: boolean; won: boolean }) {
  return (
    <span className="my-row-player" data-picked={picked ? "true" : undefined} data-won={won ? "true" : undefined}>
      {name || "—"}
      {picked ? <span className="sr-only"> ({t("me.pick")})</span> : null}
    </span>
  );
}
