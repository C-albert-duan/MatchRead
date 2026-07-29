/**
 * Server-only founder gate. Reads FOUNDER_EMAILS (comma-separated).
 * If unset / empty, any signed-in user is treated as founder (private beta).
 * Never put SUPABASE_SERVICE_ROLE_KEY here or in any public env.
 */

export function founderEmailsUnset(): boolean {
  return !process.env.FOUNDER_EMAILS?.trim();
}

export function isFounderEmail(email: string | undefined): boolean {
  const raw = process.env.FOUNDER_EMAILS?.trim();
  if (!raw) return true;
  if (!email) return false;
  const allowed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(email.trim().toLowerCase());
}
