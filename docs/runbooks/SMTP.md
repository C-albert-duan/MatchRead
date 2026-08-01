# Runbook — Custom SMTP (Supabase Auth email)

Supabase **Pro does not remove** the built-in Auth email rate limit. For private beta / invite waves, configure **custom SMTP**.

SMTP is configured in the **Supabase dashboard** (not in Vercel env). The web app only needs the anon key.

## Recommended: Resend

1. Create a [Resend](https://resend.com) account; verify a sending domain (or use `onboarding@resend.dev` for smoke tests only).
2. Create an API key.
3. Supabase → **Project Settings → Authentication → SMTP Settings** (path may be **Authentication → Emails → SMTP**):

| Field | Value |
|---|---|
| Enable custom SMTP | On |
| Sender email | `auth@yourdomain.com` (must be allowed in Resend) |
| Sender name | `MatchRead` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API key |

4. Send a test magic link from the Vercel preview `/sign-in`.
5. Confirm delivery in Resend dashboard + inbox (check spam).

## Alternative: SendGrid / Postmark / Amazon SES

Same Supabase SMTP form — use that provider’s SMTP host, port, and credentials. Prefer port **465** (SSL) or **587** (STARTTLS) per provider docs.

## Failure modes

| Symptom | Fix |
|---|---|
| Still rate-limited | Custom SMTP not enabled / still on built-in sender |
| Emails bounce | Domain not verified; SPF/DKIM incomplete |
| Works locally, fails on Preview | Unrelated to SMTP — check Auth redirect allow-list |
| “Error sending magic link” | Check Supabase Auth logs; verify SMTP password |

## Security

- SMTP password / API key stays **only** in Supabase SMTP settings.
- Never put Resend/SendGrid keys in Vercel or `NEXT_PUBLIC_*`.
