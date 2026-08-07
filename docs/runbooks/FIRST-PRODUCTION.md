# Runbook — First production / preview deploy

**Phase 11 walkthrough:** [plans/11-production-auth-checklist.md](../plans/11-production-auth-checklist.md)  
**SMTP detail:** [SMTP.md](./SMTP.md)

## Prerequisites

- GitHub repo: https://github.com/C-albert-duan/MatchRead
- Supabase project: `opugihofwvunwkpcmboq`
- Vercel account with permission to import that repo
- Custom SMTP credentials (Resend recommended) for invite volume

## Vercel project settings (monorepo)

Import the **repo root**. Then set:

| Setting | Value |
|---|---|
| **Root Directory** | `apps/web` |
| Framework | Next.js (auto) |
| Install / Build | From `apps/web/vercel.json` (`cd ../.. && npm ci` / `npm run build -w @matchread/web`) |

`apps/web/vercel.json` is committed for this layout.

## Environment variables

### Preview + Production

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://opugihofwvunwkpcmboq.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |

### Production only

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, e.g. `https://matchreadtennis.com` — **do not set on Preview** |
| `FOUNDER_EMAILS` | Optional comma-separated founder gate |

### Never on Vercel

`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `RAPIDAPI_*`, SMTP passwords.

## Supabase Auth URL configuration

**Authentication → URL configuration** — include:

| Purpose | URL |
|---|---|
| Local Docker | Site URL can stay `http://localhost:3001` while developing; for Preview testing, temporarily set Site URL to the Preview origin **or** rely on Redirect allow-list only |
| Local redirects | `http://localhost:3001/**`, `http://localhost:3001/auth/callback` |
| Vercel Preview | `https://*-matchread.vercel.app/**` (adjust to your project slug) **and** the exact Preview URL `/auth/callback` if wildcards are restricted |
| Production | `https://matchreadtennis.com/**`, `https://matchreadtennis.com/auth/callback` |

**Never** use `0.0.0.0` or Porkbun parking / `*.l.ink` URLs.

Magic-link `emailRedirectTo` is built from the **browser origin** on `/sign-in`, so Preview links follow the Preview host automatically.

## Steps

1. Push latest `main` (includes `apps/web/vercel.json`).
2. Import repo on Vercel; Root Directory `apps/web`.
3. Set Preview env: Supabase URL + anon key only.
4. Deploy Preview; open `/sign-in` on the `*.vercel.app` URL.
5. Configure [custom SMTP](./SMTP.md); send a magic link to yourself.
6. Confirm callback → session → `/leagues` (or `next`) on the **same** Preview host.
7. Production: add domain, set `NEXT_PUBLIC_SITE_URL`, extend Auth allow-list, redeploy.

**Full domain + RapidAPI path:** [GO-LIVE-MATCHREADTENNIS.md](./GO-LIVE-MATCHREADTENNIS.md) (`matchreadtennis.com` / Porkbun).

## Failure modes

| Symptom | Likely cause |
|---|---|
| Link opens localhost | Auth Site URL / old email; or `NEXT_PUBLIC_SITE_URL` set on Preview to localhost |
| Link opens `0.0.0.0` | Auth Site URL copied from Docker logs — fix allow-list |
| Preview auth goes to prod | `NEXT_PUBLIC_SITE_URL` set on Preview — remove it |
| Email never arrives | SMTP / built-in rate limit — [SMTP.md](./SMTP.md) |
| Session lost | Middleware cookies; check HTTPS / callback on same host |
| Build fails workspace pkgs | Root Directory / installCommand not using monorepo `npm ci` |
