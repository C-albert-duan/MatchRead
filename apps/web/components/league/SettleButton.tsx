"use client";

import { useState, useTransition } from "react";
import { settleLeagueTournament } from "@/app/actions/settlement";
import { useT, useTf } from "@/components/shell/LocaleProvider";

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
  const t = useT();
  const tf = useTf();

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
                ? t("settle.okZero")
                : tf("settle.ok", { n: result.graded })
            );
          });
        }}
      >
        {pending ? t("settle.settling") : t("settle.run")}
      </button>
      {message ? (
        <p className="hint" role="status">
          {message}
        </p>
      ) : (
        <p className="hint">{t("settle.hint")}</p>
      )}
    </div>
  );
}
