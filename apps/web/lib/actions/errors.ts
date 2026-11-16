import type { MessageKey } from "@matchread/i18n";
import { t } from "@/lib/i18n";

/**
 * Error copy for Server Actions (fix list P2-9). Actions return a code and
 * the viewer's-language text for it; never a raw database message.
 */
export type ActionErrorCode =
  | "sign_in"
  | "sign_in_bracket"
  | "sign_in_create"
  | "sign_in_join"
  | "tournament_not_found"
  | "bracket_start_failed"
  | "league_name_required"
  | "format_required"
  | "visibility_required"
  | "tournament_required"
  | "league_create_failed"
  | "invite_invalid"
  | "join_failed"
  | "not_commissioner"
  | "league_not_found"
  | "cannot_kick_self"
  | "cannot_kick_commissioner"
  | "member_not_found"
  | "not_a_member"
  | "commissioner_cannot_leave"
  | "update_failed"
  | "delete_failed"
  | "kick_failed"
  | "leave_failed"
  | "reissue_failed"
  | "locked_save"
  | "locked_submit"
  | "incomplete"
  | "picks_missing"
  | "save_failed"
  | "submit_failed"
  | "invalid_pick"
  | "tournament_not_in_league"
  | "league_or_tournament_not_found"
  | "unlock_unsupported"
  | "lock_role"
  | "lock_failed"
  | "display_name_invalid"
  | "display_name_failed";

/** Translated copy for a code, in the viewer's locale. */
export function actionError(code: ActionErrorCode): string {
  return t(`action.error.${code}` as MessageKey);
}

type RpcError = { message?: string | null; details?: string | null; code?: string | null };

/** DETAIL codes raised by the league and bracket RPCs (migrations 0049, 0051). */
const DETAIL_TO_CODE: Readonly<Record<string, ActionErrorCode>> = {
  not_authenticated: "sign_in",
  not_commissioner: "not_commissioner",
  invalid_invite: "invite_invalid",
  tournament_not_found: "tournament_not_found",
  cannot_kick_self: "cannot_kick_self",
  cannot_kick_commissioner: "cannot_kick_commissioner",
  member_not_found: "member_not_found",
  not_a_member: "not_a_member",
  commissioner_cannot_leave: "commissioner_cannot_leave",
  tournament_not_in_league: "tournament_not_in_league",
  pick_match_not_in_tournament: "invalid_pick",
  pick_player_not_in_match: "invalid_pick",
  incomplete_bracket: "incomplete",
  no_bracket: "picks_missing",
  tournament_required: "tournament_required",
  invalid_format: "format_required",
};

/**
 * Wording of the same errors, for a database that predates 0051. Remove once
 * every environment has migrated.
 */
const LEGACY_WORDING: ReadonlyArray<[RegExp, ActionErrorCode]> = [
  [/not authenticated/i, "sign_in"],
  [/not commissioner/i, "not_commissioner"],
  [/invalid invite|revoked/i, "invite_invalid"],
  [/tournament not found/i, "tournament_not_found"],
  [/cannot kick self/i, "cannot_kick_self"],
  [/cannot kick commissioner/i, "cannot_kick_commissioner"],
  [/member not found/i, "member_not_found"],
  [/commissioner cannot leave/i, "commissioner_cannot_leave"],
  [/not a member/i, "not_a_member"],
  [/does not include this tournament/i, "tournament_not_in_league"],
  [/invalid pick/i, "invalid_pick"],
  [/incomplete/i, "incomplete"],
  [/no bracket/i, "picks_missing"],
];

/** True when the RPC refused because the tournament or league is locked. */
export function isLockedError(error: RpcError | null | undefined): boolean {
  if (!error) return false;
  if (error.details === "tournament_locked") return true;
  return /locked/i.test(error.message ?? "");
}

/**
 * Map an RPC error to a code: DETAIL first, then legacy wording, then
 * `fallback`. Locks are handled by the caller (save and submit word them
 * differently).
 */
export function rpcErrorCode(
  error: RpcError | null | undefined,
  fallback: ActionErrorCode
): ActionErrorCode {
  const detail = error?.details ?? "";
  if (detail && DETAIL_TO_CODE[detail]) return DETAIL_TO_CODE[detail];
  const message = error?.message ?? "";
  for (const [pattern, code] of LEGACY_WORDING) {
    if (pattern.test(message)) return code;
  }
  return fallback;
}
