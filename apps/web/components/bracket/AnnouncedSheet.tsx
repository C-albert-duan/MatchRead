import Link from "next/link";
import { isLocale, t as translate, tf as translatef, type MessageKey } from "@matchread/i18n";
import { isTimedMatchStarted, type AnnouncedMatchupRow } from "@/lib/brackets/types";
import { captionTimeZone, matchScheduleCaption } from "@/lib/tournaments/format";
import { matchHref } from "@/lib/tournaments/href";

type Props = {
  matchups: AnnouncedMatchupRow[];
  expectedFirst?: number;
  locked?: boolean;
  enterHref?: string;
  venueTz?: string | null;
  locale?: string;
};

function text(locale: string, key: MessageKey): string {
  return translate(isLocale(locale) ? locale : "en", key);
}

function seedLabel(seed: number | null) {
  return seed ? ` (${seed})` : "";
}

/** Published pairs before a full sheet. Server markup. Picks stay in the editor. */
export function AnnouncedSheet({
  matchups,
  expectedFirst = 32,
  locked = false,
  enterHref,
  venueTz,
  locale = "en",
}: Props) {
  const loc = isLocale(locale) ? locale : "en";
  const zone = captionTimeZone(null, venueTz);
  const labels = {
    tba: text(loc, "match.timeTba"),
    tbc: text(loc, "calendar.dateTbc"),
    day: text(loc, "match.session.day"),
    night: text(loc, "match.session.night"),
  };

  return (
    <section className="section" aria-labelledby="announced-first">
      <h2 id="announced-first" className="section-title">
        {text(loc, "tournament.announced.title")}
      </h2>
      <p className="t-body">
        {translatef(
          loc,
          locked ? "tournament.announced.body.locked" : "tournament.announced.body",
          { have: matchups.length, need: expectedFirst }
        )}
      </p>
      <ul className="league-list">
        {matchups.map((m) => {
          const started = isTimedMatchStarted(m);
          const caption = matchScheduleCaption(
            {
              scheduled_at: m.scheduled_at,
              has_time: Boolean(m.has_time),
              session: m.session,
              court: m.court,
            },
            zone,
            loc,
            labels
          );
          const publicHref = matchHref(m.external_ref);
          const canEnter = Boolean(enterHref) && !locked && !started;
          return (
            <li key={m.match_key} className="league-card">
              <div className="row wrap gap-md between">
                <div className="stack gap-sm">
                  {caption.when || caption.place ? (
                    <p className="t-caption numeral">
                      {publicHref ? (
                        <Link href={publicHref}>
                          {caption.when ? (
                            <span className="match-when-line">{caption.when}</span>
                          ) : null}
                          {caption.place ? (
                            <span className="match-when-line">{caption.place}</span>
                          ) : null}
                        </Link>
                      ) : (
                        <>
                          {caption.when ? (
                            <span className="match-when-line">{caption.when}</span>
                          ) : null}
                          {caption.place ? (
                            <span className="match-when-line">{caption.place}</span>
                          ) : null}
                        </>
                      )}
                      {started ? ` · ${text(loc, "tournament.announced.matchStarted")}` : ""}
                    </p>
                  ) : null}
                  <div className="row wrap gap-md">
                    <Side
                      name={`${m.player1_last_name || "—"}${seedLabel(m.player1_seed)}`}
                      href={canEnter && m.player1_ref ? enterHref : undefined}
                    />
                    <span className="t-caption">{text(loc, "results.vs")}</span>
                    <Side
                      name={`${m.player2_last_name || "—"}${seedLabel(m.player2_seed)}`}
                      href={canEnter && m.player2_ref ? enterHref : undefined}
                    />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Side({ name, href }: { name: string; href?: string }) {
  if (!href) return <span className="t-body">{name}</span>;
  return (
    <Link href={href} className="act act--standard act--standard-size">
      {name}
    </Link>
  );
}
