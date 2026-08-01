# Phase 11 — Production auth + SMTP checklist

**Goal:** Magic link works on a **Vercel Preview** (or real domain), not only Docker localhost.  
**Plan:** [09-completion-to-launch § Phase 11](./09-completion-to-launch.md#phase-11--production-auth--smtp)  
**Runbooks:** [FIRST-PRODUCTION.md](../runbooks/FIRST-PRODUCTION.md) · [SMTP.md](../runbooks/SMTP.md)

Owner actions (Vercel dashboard + Supabase + Resend) cannot be fully automated from this repo. Check boxes when **you** verify.

---

## 0. Prerequisites

- [ ] Latest code on GitHub `main` (includes `apps/web/vercel.json`, site-URL harden)
- [ ] Supabase project `opugihofwvunwkpcmboq` reachable
- [ ] Vercel account can import https://github.com/C-albert-duan/MatchRead
- [ ] Resend (or other SMTP) account ready

---

## A. Vercel project (11.1)

| # | Check | How |
|---|---|---|
| A.1 | Import repo | Vercel → Add New → Project → `C-albert-duan/MatchRead` |
| A.2 | Root Directory | Set to **`apps/web`** |
| A.3 | Install / Build | Confirm `vercel.json` commands: `cd ../.. && npm ci` and `npm run build -w @matchread/web` |
| A.4 | Deploy Preview | First deploy succeeds (build green) |
| A.5 | Open Preview | `https://<deployment>.vercel.app/` loads landing |

- [ ] Section A pass

---

## B. Environment variables (11.2)

| # | Check | How |
|---|---|---|
| B.1 | Preview: URL | `NEXT_PUBLIC_SUPABASE_URL` = `https://opugihofwvunwkpcmboq.supabase.co` |
| B.2 | Preview: anon | `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon/publishable key |
| B.3 | Preview: no SITE_URL | **`NEXT_PUBLIC_SITE_URL` unset** on Preview |
| B.4 | Preview: no secrets | No `SUPABASE_SERVICE_ROLE_KEY`, no SMTP password, no `RAPIDAPI_*` |
| B.5 | Redeploy | Redeploy Preview after env changes |
| B.6 | Prod (later) | Production: set `NEXT_PUBLIC_SITE_URL` to canonical HTTPS origin; optional `FOUNDER_EMAILS` |

- [ ] Section B pass (B.6 can wait until domain is ready)

---

## C. Supabase Auth URLs (11.3)

Supabase → **Authentication → URL configuration**

| # | Check | How |
|---|---|---|
| C.1 | Local still works | Keep `http://localhost:3001/**` and callback for Docker |
| C.2 | Preview wildcard | Add `https://*-<project>.vercel.app/**` (match your Vercel slug) |
| C.3 | Exact Preview (if needed) | Add this deployment’s `https://….vercel.app/auth/callback` |
| C.4 | No bad hosts | Remove `0.0.0.0`, `*.l.ink`, parking domains |
| C.5 | Site URL | Prefer Preview origin while testing Preview auth, **or** localhost for local-only; for Production cutover set Site URL to canonical domain |

- [ ] Section C pass

---

## D. Custom SMTP (11.4)

Follow [SMTP.md](../runbooks/SMTP.md) (Resend recommended).

| # | Check | How |
|---|---|---|
| D.1 | SMTP enabled | Supabase custom SMTP toggle on |
| D.2 | Sender verified | Domain (or Resend test sender) verified |
| D.3 | Test send | Magic link from Preview `/sign-in` arrives in inbox |
| D.4 | Not rate-limited | Several sends in a row succeed (built-in cap no longer blocking) |

- [ ] Section D pass

---

## E. Magic link E2E on Preview (11.5)

On the **Preview URL** (not localhost, not `0.0.0.0`):

| # | Check | How |
|---|---|---|
| E.1 | Sign-in page | `/sign-in` loads; form submits |
| E.2 | Email link host | Hover/copy magic link — `redirect_to` starts with your **Preview** origin + `/auth/callback` |
| E.3 | Callback | Click link → lands on Preview `/auth/callback` then `/leagues` (or `next`) |
| E.4 | Session | Refresh still signed in (remember device on) |
| E.5 | No parking page | Never lands on Porkbun / wrong domain |
| E.6 | Optional second browser | Incognito: second email can sign in |

- [ ] Section E pass

---

## Pass criteria

| Result | Action |
|---|---|
| **A–E checked** | Mark Phase 11 **Done** in [STATUS.md](../STATUS.md); tick LAUNCH-CHECKLIST magic-link + SMTP items |
| Build fails | Fix monorepo install/build (Root Directory / `vercel.json`) |
| Email / redirect fails | Use failure tables in FIRST-PRODUCTION + SMTP runbooks |

**Out of scope for Phase 11:** invite-wave commissioner smoke (Phase 12), settlement cron (Phase 13).

---

## What Phase 11 shipped in-repo

| Artifact | Purpose |
|---|---|
| `apps/web/vercel.json` | Monorepo install/build from `apps/web` root directory |
| `.vercelignore` | Skip Wireframe / docs bulk in uploads |
| `apps/web/lib/site-url-client.ts` | Magic-link redirect uses **browser origin** (Preview-safe) |
| `docs/runbooks/SMTP.md` | Resend/custom SMTP setup |
| `docs/runbooks/FIRST-PRODUCTION.md` | Updated Vercel + Auth steps |
| This checklist | Owner verification |

---

## Quick reference

| Item | Value |
|---|---|
| GitHub | https://github.com/C-albert-duan/MatchRead |
| Supabase | `https://opugihofwvunwkpcmboq.supabase.co` |
| Vercel Root Directory | `apps/web` |
| Local still | `docker compose --env-file .env.docker up --build` |
