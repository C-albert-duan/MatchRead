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

function formatDelta(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
}

export function StandingsTable({ rows, kind = "event" }: Props) {
  if (rows.length === 0) {
    return (
      <p className="t-body">
        No standings yet. Submit brackets, then run settlement.
      </p>
    );
  }

  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th className="col-rank" scope="col">
            #
          </th>
          <th scope="col">Member</th>
          <th className="col-score" scope="col">
            {kind === "season" ? "Pts" : "Score"}
          </th>
          <th className="col-delta" scope="col">
            Δ
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.user_id} className={row.isYou ? "is-you" : undefined}>
            <td className="col-rank numeral">{row.position ?? "—"}</td>
            <td>
              {row.label}
              {row.champion_alive === false ? (
                <span className="t-caption"> · champion out</span>
              ) : null}
            </td>
            <td className="col-score numeral">{row.score}</td>
            <td
              className={`col-delta numeral ${deltaClass(
                kind === "season" ? row.score_delta : row.position_delta
              )}`}
            >
              {kind === "season"
                ? formatDelta(row.score_delta)
                : formatDelta(row.position_delta)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
