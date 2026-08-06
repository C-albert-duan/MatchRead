"use client";

import { useState, useTransition } from "react";
import { joinLeagueWithToken } from "@/app/actions/leagues";
import { useT } from "@/components/shell/LocaleProvider";

export function JoinLeagueButton({ token }: { token: string }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="stack gap-sm">
      <button
        type="button"
        className="act act--prominent act--prominent-size"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setError(null);
            const result = await joinLeagueWithToken(token);
            if (result && !result.ok) {
              setError(result.error);
            }
          });
        }}
      >
        {pending ? t("join.joining") : t("join.cta")}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
