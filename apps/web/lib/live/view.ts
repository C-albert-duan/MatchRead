/**
 * Canonical live display. Provider payload fields are not read.
 * Match and tournament uuids are not part of this view.
 */
import { normalizeLiveMatchState, type LiveMatchState } from "@matchread/core";

export type LiveDisplayState = Omit<LiveMatchState, "matchId" | "tournamentId">;

const TOURNAMENT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARE_ID = /^\d+$/;

/** Public tournament token. A uuid or a bare numeric id is not a tournament ref. */
export function isPublicTournamentRef(ref: string | null | undefined): boolean {
  const value = ref?.trim() ?? "";
  if (!value || TOURNAMENT_UUID.test(value) || BARE_ID.test(value)) return false;
  return true;
}

export function tournamentRefFrom(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const ref = (body as { tournamentRef?: unknown }).tournamentRef;
  if (typeof ref !== "string" || !isPublicTournamentRef(ref)) return null;
  return ref.trim();
}

/**
 * One match of canonical live state.
 * Stored set and game text are accepted. Provider score, points, and indicator names are not.
 */
export function liveDisplayState(row: unknown): LiveDisplayState | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const publicRef = text(record.publicRef ?? record.public_ref);
  if (!publicRef) return null;
  const state = normalizeLiveMatchState({
    matchId: publicRef,
    tournamentId: "tournament",
    publicRef,
    phase: text(record.phase) ?? "",
    sets: text(record.sets ?? record.score_text ?? record.scoreText),
    game: text(record.game ?? record.points_text ?? record.pointsText),
    serving: text(record.serving ?? record.serving_side ?? record.servingSide),
    provisionalWinner: text(
      record.provisionalWinner ?? record.provisional_winner_ref ?? record.provisionalWinnerRef
    ),
    occurredAt: text(record.occurredAt ?? record.occurred_at),
    receivedAt: text(record.receivedAt ?? record.received_at) ?? "",
  });
  if (!state) return null;
  return {
    publicRef: state.publicRef,
    phase: state.phase,
    sets: state.sets,
    game: state.game,
    serving: state.serving,
    flag: state.flag,
    provisionalWinner: state.provisionalWinner,
    occurredAt: state.occurredAt,
    receivedAt: state.receivedAt,
  };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
