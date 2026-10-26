import Link from "next/link";
import { MatchRow } from "@/components/me/MatchRow";
import { getLocale, t, tf } from "@/lib/i18n";
import type { MyMatchRow } from "@/lib/me/my-tennis";
import type { StageModel } from "@/lib/me/stage-policy";
import { formatCountdown } from "@/lib/tournaments/calendar";

type Props = {
  model: StageModel;
  names: Readonly<Record<string, string>>;
  now: Date;
};

function matchLabel(row: MyMatchRow): string {
  return `${row.sideA?.lastName || "—"} ${t("results.vs")} ${row.sideB?.lastName || "—"}`;
}

/** The next thing of the user's, as one line. A countdown is a duration, so it needs no zone. */
function UpNext({ row, now }: { row: MyMatchRow | null; now: Date }) {
  if (!row) return <p className="t-body">{t("me.stage.nothingNext")}</p>;
  const when = row.hasTime && row.startsAt ? formatCountdown(row.startsAt, getLocale(), now) : null;
  return (
    <p className="stage-number">
      {when
        ? tf("me.stage.startsIn", { match: matchLabel(row), when })
        : tf("me.stage.tba", { match: matchLabel(row) })}
    </p>
  );
}

/**
 * My Tennis Stage: one calm state at a time. The state headline is the only
 * live region, so score ticks inside the Stage are never announced and focus
 * never moves. `urgent` and `cascade` arrive here already mapped to a calm
 * treatment (stage-policy.ts).
 */
export function Stage({ model, names, now }: Props) {
  const { treatment } = model;
  return (
    <section className="stage" data-treatment={treatment} aria-labelledby="stage-status">
      <p id="stage-status" className="eyebrow" role="status" aria-live="polite">
        {t(`me.stage.status.${treatment}`)}
      </p>

      {treatment === "morning" ? (
        <>
          <dl className="stage-facts">
            <Fact label={t("me.stage.fact.upcoming")} value={model.facts.upcoming} />
            <Fact label={t("me.stage.fact.tournaments")} value={model.facts.tournaments} />
            <Fact label={t("me.stage.fact.banked")} value={model.facts.banked} />
            <Fact label={t("me.stage.fact.ceiling")} value={model.facts.ceiling} />
          </dl>
          <UpNext row={model.upNext} now={now} />
        </>
      ) : null}

      {treatment === "live" && model.focus ? (
        <MatchRow row={model.focus} names={names} size="stage" />
      ) : null}

      {treatment === "next" ? (
        <>
          {model.focus ? (
            <div className="stack gap-sm">
              <p className="t-caption">{t("me.stage.justSettled")}</p>
              <MatchRow row={model.focus} names={names} size="stage" />
            </div>
          ) : null}
          <div className="stack gap-sm">
            <p className="t-caption">{t("me.stage.upNext")}</p>
            <UpNext row={model.upNext} now={now} />
          </div>
        </>
      ) : null}

      {treatment === "reckoning" ? (
        <dl className="stage-facts">
          <Fact label={t("me.triad.banked")} value={model.reckoning.banked} />
          <Fact label={t("me.triad.ceiling")} value={model.reckoning.ceiling} />
          <Fact label={t("me.stage.reckoning.settled")} value={model.reckoning.settled} />
          <Fact label={t("me.stage.reckoning.lost")} value={model.reckoning.lost} miss={model.reckoning.lost > 0} />
        </dl>
      ) : null}

      {treatment === "empty" ? (
        <div className="stack gap-md">
          <p className="t-body">{t("me.stage.empty.body")}</p>
          <p>
            <Link href="/tournaments" className="act act--prominent act--standard-size">
              {t("me.stage.empty.cta")}
            </Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Fact({ label, value, miss = false }: { label: string; value: number; miss?: boolean }) {
  return (
    <div className="stage-fact" data-miss={miss ? "true" : undefined}>
      <dt className="t-caption">{label}</dt>
      <dd className="stage-fact-value numeral">{value}</dd>
    </div>
  );
}
