/**
 * Reason → message key and variables. Core reasons carry a kind and
 * parameters; the words live in packages/i18n for every locale.
 */
import type { MessageKey } from "@matchread/i18n";
import type { Reason } from "@matchread/core";

export function reasonMessage(
  reason: Reason,
  names: Readonly<Record<string, string>>
): { key: MessageKey; vars: Record<string, string | number> } {
  const playerRef = typeof reason.params.playerRef === "string" ? reason.params.playerRef : "";
  const player = names[playerRef] || "—";
  const pct = typeof reason.params.sharePct === "number" ? reason.params.sharePct : 0;
  const vars = { player, pct };
  switch (reason.kind) {
    case "flag": {
      const flag = reason.params.flag === "match-point" ? "match-point" : "break-point";
      const side = reason.params.against === true ? "against" : "for";
      return { key: `me.reason.flag.${side}.${flag}` as MessageKey, vars };
    }
    case "champion": {
      const state =
        reason.params.state === "out" || reason.params.state === "pressure"
          ? reason.params.state
          : "on-court";
      return { key: `me.reason.champion.${state}` as MessageKey, vars };
    }
    case "forward": {
      const state =
        reason.params.state === "eliminated" || reason.params.state === "pressure"
          ? reason.params.state
          : "open";
      return { key: `me.reason.forward.${state}` as MessageKey, vars };
    }
    default:
      return { key: `me.reason.${reason.kind}` as MessageKey, vars };
  }
}
