# Auth

## Method

**Magic link only** on web — email, no password, no social provider for launch.

There is no separate "Create account" screen. A first-time address gets an account when it completes the round trip.

## Flow

1. `/sign-in` — enter email  
2. `signInWithOtp` with `emailRedirectTo` → `/auth/callback` + sanitised `next`  
3. "Check your email" state on same route  
4. Callback sets session → redirect to `next` or `/leagues`

## Rules

- Validate email on submit, not on keystroke.
- Disable send while in flight and for ~30s after success (rate-limit protection).
- `safeNext()` accepts by shape, never blocklist — malformed `next` falls back to `/`.
- Locale survives via cookie + profile column, not URL segment.

## Deploy verification (blocker)

Magic link must be proven against a **deployed** Supabase project + real redirect allow-list before calling auth done. See [runbooks/FIRST-PRODUCTION.md](./runbooks/FIRST-PRODUCTION.md).

## Env

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` — **prod only**; omit on Vercel Preview so `VERCEL_URL` is used
