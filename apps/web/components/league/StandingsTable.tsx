import { t } from "@/lib/i18n";

type StandingRow = {
  user_id: string;
  score: number;
  position: number | null;
  previous_position?: number | null;
  score_delta?: number | null;
  position_delta?: number | null;
  upside?: number | null;
  champion_alive?: boolean | null;
  label: string;
  isYou: boolean;
};

type Props = {
  rows: StandingRow[];
  kind?: "event" | "season";
};

function deltaClass(n: number | null | undefined): string {
  if (n == null || n === 0) return "delta--flat";
  return n > 0 ? "delta--up" : "delta--down";
}

/** Event standings: position chips (+2 / −1 / —). Season: score Δ. */
function formatMoveChip(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "—";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function formatScoreDelta(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "—";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

export function StandingsTable({ rows, kind = "event" }: Props) {
  if (rows.length === 0) {
    return <p className="t-body">{t("standings.empty")}</p>;
  }

  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th className="col-rank" scope="col">
            #
          </th>
          <th scope="col">{t("standings.member")}</th>
          <th className="col-score" scope="col">
            {kind === "season" ? t("standings.pts") : t("standings.score")}
          </th>
          <th className="col-delta" scope="col">
            {t("standings.move")}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const delta =
            kind === "season" ? row.score_delta : row.position_delta;
          const chip =
            kind === "season"
              ? formatScoreDelta(delta)
              : formatMoveChip(delta);
          return (
            <tr key={row.user_id} className={row.isYou ? "is-you" : undefined}>
              <td className="col-rank numeral">{row.position ?? "—"}</td>
              <td>
                {row.label}
                {row.champion_alive === false ? (
                  <span className="t-caption"> · {t("standings.championOut")}</span>
                ) : null}
              </td>
              <td className="col-score numeral">{row.score}</td>
              <td className="col-delta">
                <span
                  className={`move-chip ${deltaClass(delta)}`}
                  aria-label={
                    delta == null || delta === 0
                      ? "No movement"
                      : delta > 0
                        ? `Up ${delta}`
                        : `Down ${Math.abs(delta)}`
                  }
                >
                  {chip}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
