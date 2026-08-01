"use client";

import { useState, useTransition } from "react";
import { settleLeagueTournament } from "@/app/actions/settlement";

type Props = {
  leagueId: string;
  leagueSlug: string;
  tournamentId: string;
  tournamentRef: string;
};

export function SettleButton({
  leagueId,
  leagueSlug,
  tournamentId,
  tournamentRef,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="stack gap-sm">
      <button
        type="button"
        className="act act--prominent act--standard-size"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await settleLeagueTournament({
              leagueId,
              leagueSlug,
              tournamentId,
              tournamentRef,
            });
            if (!result.ok) {
              setMessage(result.error);
              return;
            }
            setMessage(
              result.graded === 0
                ? "Settlement ran — no submitted brackets yet."
                : `Settled ${result.graded} bracket${result.graded === 1 ? "" : "s"}.`
            );
          });
        }}
      >
        {pending ? "Settling…" : "Run settlement"}
      </button>
      {message ? (
        <p className="hint" role="status">
          {message}
        </p>
      ) : (
        <p className="hint">
          Grades submitted brackets against official fixture results (server).
        </p>
      )}
    </div>
  );
}
