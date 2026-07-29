# Project status

**Updated:** 2026-07-29  
**Repo:** https://github.com/C-albert-duan/MatchRead  
**Supabase project:** `rdfcklsshutampxsgltj` (`https://rdfcklsshutampxsgltj.supabase.co`)  
**Local app:** http://localhost:3001

---

## Current phase

| Phase | Status |
|---|---|
| **0 — Bootstrap** | **Done** |
| **1 — Auth + Landing** | **Done** (local magic-link + landing verified by owner) |
| **2 — Leagues + Invites** | **Next** |
| 3–8 | Not started |

---

## Phase 0 — Bootstrap (done)

| Item | Status |
|---|---|
| Monorepo (`apps/web`, `packages/*`, `supabase/`) | Done |
| `docs/` plans, architecture, runbooks | Done |
| `Wireframe/` kept as read-only reference | Done |
| `npm install` / `typecheck` / `build` | Done |
| Dev server | Done (`next dev -p 3001`) |
| GitHub remote + first push | Done → [C-albert-duan/MatchRead](https://github.com/C-albert-duan/MatchRead) |

---

## Phase 1 — Auth + Landing (done)

| Item | Status | Notes |
|---|---|---|
| Public landing (`/`) | Done | Hero, calendar strip, how-it-works, charcoal CTAs |
| App shell session CTAs | Done | Signed out: Sign in / Start a league · Signed in: Leagues / Sign out |
| Magic-link `/sign-in` | Done | Submit-time validation, check-email state, 30s resend cooldown |
| `/auth/callback` + `safeNext(?next=)` | Done | Open-redirect safe by shape |
| Supabase SSR clients + middleware refresh | Done | Anon/publishable key only — no service role on web |
| Local `.env.local` | Done | Gitignored; see `.env.example` |
| Auth URL allow-list (localhost:3001) | Done | Owner configured in Supabase dashboard |
| Magic-link round trip (local) | Done | Owner confirmed Phase 1 complete |
| `/leagues` + `/leagues/new` stubs | Done | Auth-gated placeholders for Phase 2 |
| Profiles migration (`0001_init.sql`) | Partial | SQL ready; run via SQL Editor if not applied yet ([SUPABASE-SETUP.md](./SUPABASE-SETUP.md)) |
| Vercel preview deploy | Not yet | Recommended before calling auth “production-ready” |
| Deployed-domain magic-link proof | Not yet | Blocker for public beta, not for Phase 2 coding |

### Phase 1 routes

| Route | Role |
|---|---|
| `/` | Landing |
| `/sign-in` | Magic link |
| `/auth/callback` | OTP exchange → `next` |
| `/leagues` | Stub home (auth required) |
| `/leagues/new` | Stub create (auth required) |
| `/tournaments`, `/showcase` | Reference stubs |

---

## Infrastructure

| Piece | Status |
|---|---|
| GitHub | Live — `main` on C-albert-duan/MatchRead |
| Supabase Auth API | Reachable with publishable key |
| Supabase schema (profiles + RLS) | Apply `0001_init.sql` if not already (SQL Editor) |
| Vercel | Not connected yet |
| RapidAPI / settlement cron / Railway listener | Out of scope until later phases |

**Security notes**

- Never commit `.env.local` or `SUPABASE_SERVICE_ROLE_KEY` to Vercel/web.
- DB password must not live in the repo; rotate if it was shared in chat.

---

## Next up — Phase 2

Plan: [plans/02-leagues-invites.md](./plans/02-leagues-invites.md)

Create league → invite link → join → appear on league home, with RLS.

---

## First-week checkpoint

- [x] Repo on GitHub with `Wireframe/` + `docs/` + app scaffold
- [x] Supabase auth round-trip works locally
- [ ] Supabase auth round-trip on a Vercel preview
- [ ] Create league + invite + join E2E
- [ ] One fixture tournament bracket filled and submitted
