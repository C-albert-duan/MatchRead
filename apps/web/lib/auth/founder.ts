/**
 * Server-only founder gate. Reads FOUNDER_EMAILS (comma-separated).
 * If unset / empty, any signed-in user is treated as founder only in local
 * development. Anywhere else (production, previews) an unset list admits
 * nobody (fix list P2-10).
 * Never put SUPABASE_SERVICE_ROLE_KEY here or in any public env.
 */

export function founderEmailsUnset(): boolean {
  return !process.env.FOUNDER_EMAILS?.trim();
}

/** Local `next dev` only. A build (NODE_ENV=production) never opens the gate. */
function openWhenUnset(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL_ENV;
}

export function isFounderEmail(email: string | undefined): boolean {
  const raw = process.env.FOUNDER_EMAILS?.trim();
  if (!raw) return openWhenUnset();
  if (!email) return false;
  const allowed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return openWhenUnset();
  return allowed.includes(email.trim().toLowerCase());
}
