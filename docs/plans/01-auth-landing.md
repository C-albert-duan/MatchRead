# Plan 01 — Auth + Landing

## Goal

Magic-link sign-in and public landing page against Supabase Auth.

## Status: **DONE** (2026-07-29)

Local round trip confirmed. Vercel preview proof remains a later launch checklist item, not a blocker for Phase 2.

## Done when

- [x] `/` renders landing argument + calendar strip (fixture OK)
- [x] `/sign-in` → OTP → check-email state
- [x] `/auth/callback` honors `?next=`
- [x] Round trip proven against this project's Supabase (local `localhost:3001`)
- [ ] Round trip on Vercel preview / production domain — tracked in [STATUS.md](../STATUS.md) launch checklist

## Work

1. [x] Supabase SSR client (`@supabase/ssr`)
2. [x] Middleware session refresh
3. [x] Landing Server Component (anonymous-readable)
4. [x] Sign-in client island for form only
5. [x] Auth redirect URLs configured for local (`http://localhost:3001/auth/callback`)

## Local setup

See [SUPABASE-SETUP.md](../SUPABASE-SETUP.md) and [01-auth-landing-checklist.md](./01-auth-landing-checklist.md).

## References

[AUTH.md](../AUTH.md) · wireframe screens: Landing, Sign in, Check your email · [STATUS.md](../STATUS.md)
