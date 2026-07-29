# Phase 1 test checklist — Auth + Landing

Dev server: **http://localhost:3001**

## Prerequisites

- [ ] `apps/web/.env.local` has real `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `NEXT_PUBLIC_SITE_URL=http://localhost:3001`
- [ ] Supabase Auth allow-list includes `http://localhost:3001/auth/callback`
- [ ] Dev server restarted after editing env

## Without env (graceful)

- [ ] Landing still loads
- [ ] `/sign-in` shows configure-env message (not a crash)

## With env configured

- [ ] `/` — Start a league / See what it looks like / calendar / how it works
- [ ] Signed out: header shows Sign in + Start a league
- [ ] `/sign-in` — email field + **Send me a link**
- [ ] Invalid email on submit → error under field (not while typing)
- [ ] Valid email → **Check your email** state shows the address
- [ ] Resend disabled ~30s, then enabled
- [ ] Magic link in inbox → opens `/auth/callback?next=...` → lands on `next` (default `/leagues`)
- [ ] Signed in: header shows Leagues + Sign out; landing CTA is **Go to my leagues**
- [ ] `/leagues` requires auth (redirects to sign-in if signed out)
- [ ] Sign out → back to landing signed-out CTAs
- [ ] Malformed `?next=https://evil.com` falls back safely (not an open redirect)

## Pass criteria

All **With env configured** boxes checked, including a real magic-link round trip → Phase 1 code complete. Deployed Vercel proof is still required before calling auth production-ready (see plan).
