"use client";

import { useState, useTransition } from "react";
import { stubVoidPlayer } from "@/app/actions/settlement";

export type TournamentOption = {
  id: string;
  ref: string;
  name: string;
};

type Props = {
  tournaments: TournamentOption[];
  preview: string;
  submitLabel: string;
  submittingLabel: string;
  afterMessage: string;
};

export function DisruptionForm({
  tournaments,
  preview,
  submitLabel,
  submittingLabel,
  afterMessage,
}: Props) {
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? "");
  const [playerId, setPlayerId] = useState("");
  const [fromRound, setFromRound] = useState(0);
  const [reason, setReason] = useState("withdrawal");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const selected = tournaments.find((t) => t.id === tournamentId);

  return (
    <form
      className="stack gap-xl"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(null);
        startTransition(async () => {
          const result = await stubVoidPlayer({
            tournamentId,
            playerId: playerId.trim(),
            fromRound,
            reason: reason.trim() || "withdrawal",
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(
            `${afterMessage} (${result.graded} match result${
              result.graded === 1 ? "" : "s"
            } marked void.)`
          );
        });
      }}
    >
      <p className="t-body">{preview}</p>

      <label className="stack gap-sm">
        <span className="field-label">Tournament</span>
        <select
          className="field"
          value={tournamentId}
          onChange={(e) => setTournamentId(e.target.value)}
          required
        >
          {tournaments.length === 0 ? (
            <option value="">No tournaments</option>
          ) : (
            tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.ref})
              </option>
            ))
          )}
        </select>
      </label>

      <label className="stack gap-sm">
        <span className="field-label">Player id</span>
        <input
          className="field"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          placeholder="uuid or provider_id"
          required
          autoComplete="off"
        />
        <span className="hint">
          Seat player_id (UUID) or players.provider_id from the published draw.
        </span>
      </label>

      <label className="stack gap-sm">
        <span className="field-label">From round</span>
        <input
          className="field"
          type="number"
          min={0}
          max={16}
          value={fromRound}
          onChange={(e) => setFromRound(Number(e.target.value) || 0)}
          required
        />
        <span className="hint">
          0 = first round (r0). Voids from this round onward when possible.
        </span>
      </label>

      <label className="stack gap-sm">
        <span className="field-label">Reason</span>
        <input
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="withdrawal"
          required
        />
      </label>

      {selected ? (
        <p className="hint">
          Target: {selected.name} · {selected.ref}
        </p>
      ) : null}

      <button
        type="submit"
        className="act act--prominent act--prominent-size"
        disabled={pending || !tournamentId || !playerId.trim()}
        style={{ alignSelf: "flex-start" }}
      >
        {pending ? submittingLabel : submitLabel}
      </button>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="hint" role="status">
          {done}
        </p>
      ) : null}
    </form>
  );
}
