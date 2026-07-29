/**
 * Accepts relative in-app paths by shape. Malformed → fallback.
 * Never use a blocklist — safeNext rejects by shape only.
 */
export function safeNext(
  raw: string | null | undefined,
  fallback = "/leagues"
): string {
  if (!raw || typeof raw !== "string") return fallback;
  const next = raw.trim();
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  if (next.includes("://")) return "/";
  if (next.includes("\\")) return "/";
  return next;
}
