"use client";

import { useState, useTransition } from "react";
import {
  recordOfficialResult,
  settleAllLeaguesForTournament,
} from "@/app/actions/settlement";

type Props = {
  leagueId: string;
  leagueSlug: string;
  tournamentId: string;
  tournamentRef: string;
  isFounder: boolean;
};

export function OfficialResultsPanel({
  leagueId,
  leagueSlug,
  tournamentId,
  tournamentRef,
  isFounder,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [matchKey, setMatchKey] = useState("r0-m0");
  const [winnerRef, setWinnerRef] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="panel stack gap-md" aria-labelledby="official-results">
      <h2 id="official-results" className="section-title">
        Official results
      </h2>
      <p className="t-body">
        Record a finished match (fixture keys like <code>r0-m0</code>). Then run
        settlement so standings and Daily Check move.
      </p>
      <div className="stack gap-sm">
        <label className="field-label" htmlFor="match-key">
          Match key
        </label>
        <input
          id="match-key"
          className="field"
          value={matchKey}
          onChange={(e) => setMatchKey(e.target.value)}
          disabled={pending}
        />
        <label className="field-label" htmlFor="winner-ref">
          Winner player_ref
        </label>
        <input
          id="winner-ref"
          className="field"
          value={winnerRef}
          onChange={(e) => setWinnerRef(e.target.value)}
          disabled={pending}
          placeholder="e.g. p001"
        />
      </div>
      <div className="row wrap gap-md">
        <button
          type="button"
          className="act act--standard act--standard-size"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await recordOfficialResult({
                leagueId,
                leagueSlug,
                tournamentId,
                tournamentRef,
                matchKey,
                winnerRef,
              });
              setMessage(
                result.ok
                  ? `Saved ${matchKey}. Run settlement next.`
                  : result.error
              );
            });
          }}
        >
          {pending ? "Saving…" : "Save result"}
        </button>
        {isFounder ? (
          <button
            type="button"
            className="act act--prominent act--standard-size"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await settleAllLeaguesForTournament({
                  tournamentId,
                  tournamentRef,
                });
                setMessage(
                  result.ok
                    ? `Settled all leagues — ${result.graded} bracket(s).`
                    : result.error
                );
              });
            }}
          >
            {pending ? "Settling…" : "Settle all leagues"}
          </button>
        ) : null}
      </div>
      {message ? (
        <p className="hint" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
