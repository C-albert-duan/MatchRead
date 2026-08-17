import {
  detailBracketGrade,
  type BracketPicks,
  type DrawSeat,
  type OfficialResults,
} from "@matchread/core";
import { t } from "@/lib/i18n";

type Props = {
  drawSize: number;
  picks: BracketPicks;
  official: OfficialResults;
  seats: DrawSeat[];
};

function playerLabel(
  ref: string | null,
  byRef: Map<string, DrawSeat>
): string {
  if (!ref) return "—";
  const seat = byRef.get(ref);
  if (!seat) return ref;
  const seed = seat.seed != null ? `(${seat.seed}) ` : "";
  return `${seed}${seat.last_name}`;
}

export function ResultPickBreakdown({
  drawSize,
  picks,
  official,
  seats,
}: Props) {
  const OUTCOME_LABEL: Record<string, string> = {
    correct: t("result.outcome.correct"),
    incorrect: t("result.outcome.miss"),
    voided: t("result.outcome.void"),
    pending: t("result.outcome.awaiting"),
    unpicked: t("result.outcome.nopick"),
  };
  const detail = detailBracketGrade({ drawSize, picks, official });
  const byRef = new Map(
    seats.filter((s) => s.player_id).map((s) => [s.player_id as string, s])
  );

  const rounds = new Map<number, typeof detail.matches>();
  for (const m of detail.matches) {
    const list = rounds.get(m.roundIndex) ?? [];
    list.push(m);
    rounds.set(m.roundIndex, list);
  }

  const graded = detail.matches.filter(
    (m) => m.outcome === "correct" || m.outcome === "incorrect"
  );
  if (graded.length === 0 && detail.championBonus.outcome === "pending") {
    return (
      <section className="panel stack gap-md">
        <h2 className="section-title">{t("result.pickByPick")}</h2>
        <p className="t-body">{t("result.notGraded")}</p>
      </section>
    );
  }

  return (
    <section className="panel stack gap-lg result-breakdown">
      <div className="stack gap-sm">
        <h2 className="section-title">{t("result.pickByPick")}</h2>
        <p className="t-caption">{t("result.pickByPick.lede")}</p>
      </div>

      {[...rounds.entries()].map(([roundIndex, matches]) => {
        const column = matches[0]?.roundColumn ?? `Round ${roundIndex}`;
        const decided = matches.filter(
          (m) =>
            m.outcome === "correct" ||
            m.outcome === "incorrect" ||
            m.outcome === "voided"
        );
        if (decided.length === 0) return null;

        return (
          <div key={roundIndex} className="stack gap-md">
            <h3 className="eyebrow">{column}</h3>
            <ul className="result-breakdown-list">
              {matches.map((m) => {
                if (
                  m.outcome !== "correct" &&
                  m.outcome !== "incorrect" &&
                  m.outcome !== "voided"
                ) {
                  return null;
                }
                return (
                  <li
                    key={m.matchKey}
                    className={`result-breakdown-row result-breakdown-row--${m.outcome}`}
                  >
                    <div className="result-breakdown-main">
                      <span className="t-caption">
                        {column} {m.indexInRound + 1}
                      </span>
                      <p className="result-breakdown-pick">
                        {t("result.you")}: {playerLabel(m.pickRef, byRef)}
                      </p>
                      <p className="result-breakdown-official">
                        {t("result.official")}: {playerLabel(m.winnerRef, byRef)}
                      </p>
                    </div>
                    <div className="result-breakdown-side">
                      <span
                        className={`result-breakdown-tag result-breakdown-tag--${m.outcome}`}
                      >
                        {OUTCOME_LABEL[m.outcome]}
                      </span>
                      {m.points > 0 ? (
                        <span className="numeral t-caption">+{m.points}</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {detail.championBonus.outcome === "correct" ||
      detail.championBonus.outcome === "incorrect" ||
      detail.championBonus.outcome === "voided" ? (
        <div className="stack gap-md">
          <h3 className="eyebrow">{t("result.championBonus")}</h3>
          <ul className="result-breakdown-list">
            <li
              className={`result-breakdown-row result-breakdown-row--${detail.championBonus.outcome}`}
            >
              <div className="result-breakdown-main">
                <span className="t-caption">{t("result.namingChampion")}</span>
                <p className="result-breakdown-pick">
                  {t("result.you")}: {playerLabel(detail.championBonus.pickRef, byRef)}
                </p>
                <p className="result-breakdown-official">
                  {t("result.official")}:{" "}
                  {playerLabel(detail.championBonus.winnerRef, byRef)}
                </p>
              </div>
              <div className="result-breakdown-side">
                <span
                  className={`result-breakdown-tag result-breakdown-tag--${detail.championBonus.outcome}`}
                >
                  {OUTCOME_LABEL[detail.championBonus.outcome]}
                </span>
                {detail.championBonus.points > 0 ? (
                  <span className="numeral t-caption">
                    +{detail.championBonus.points}
                  </span>
                ) : null}
              </div>
            </li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}
