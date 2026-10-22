import type { MatchSheetPresentation } from "../brackets/resolution.ts";

/** The three live fields. The bracket tree is not part of this view. */
export type LiveScoreFields = {
  badge: string | null;
  score: string;
  /** Null when the server is unknown. The score is not a server. */
  serving: string | null;
  /** Calm line for a provisional finish. Null while the match is still live. */
  note: string | null;
};

/**
 * Side `a` or `b` only when that side was stored.
 * Any other value, including null, is no server. Game counts are not read.
 */
export function knownServingSide(serving: string | null | undefined): "a" | "b" | null {
  if (serving === "a" || serving === "b") return serving;
  return null;
}

export function liveScoreFields(
  presentation: MatchSheetPresentation,
  labels: { live: string; stale: string; provisional: string; serving: string }
): LiveScoreFields | null {
  if (presentation.state !== "live" && presentation.state !== "provisional") return null;
  if (presentation.state === "provisional") {
    return {
      badge: null,
      score: presentation.showScore || "",
      serving: null,
      note: labels.provisional,
    };
  }
  const side = knownServingSide(presentation.servingSide);
  return {
    badge: presentation.stale ? labels.stale : labels.live,
    score: presentation.showScore || "",
    serving: side ? labels.serving : null,
    note: null,
  };
}
