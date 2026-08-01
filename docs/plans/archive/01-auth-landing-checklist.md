# Phase 1 test checklist — Auth + Landing

**Status: complete** (owner confirmed 2026-07-29). Kept for regression re-runs.

Dev server: **http://localhost:3001**

## Prerequisites

- [x] `apps/web/.env.local` has real `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [x] `NEXT_PUBLIC_SITE_URL=http://localhost:3001`
- [x] Supabase Auth allow-list includes `http://localhost:3001/auth/callback`
- [x] Dev server restarted after editing env

## With env configured

- [x] `/` — Start a league / See what it looks like / calendar / how it works
- [x] Signed out: header shows Sign in + Start a league
- [x] `/sign-in` — email field + **Send me a link**
- [x] Invalid email on submit → error under field (not while typing)
- [x] Valid email → **Check your email** state shows the address
- [x] Resend disabled ~30s, then enabled
- [x] Magic link in inbox → opens `/auth/callback?next=...` → lands on `next` (default `/leagues`)
- [x] Signed in: header shows Leagues + Sign out; landing CTA is **Go to my leagues**
- [x] `/leagues` requires auth (redirects to sign-in if signed out)
- [x] Sign out → back to landing signed-out CTAs
- [x] Malformed `?next=` rejected by `safeNext` (shape check)

## Pass criteria

All boxes above → Phase 1 complete. See [STATUS.md](../STATUS.md).
