# Deployment — GitHub · Vercel · Supabase

**Phase 11 checklist:** [plans/11-production-auth-checklist.md](./plans/11-production-auth-checklist.md)  
**Runbooks:** [FIRST-PRODUCTION](./runbooks/FIRST-PRODUCTION.md) · [SMTP](./runbooks/SMTP.md)

## 1. GitHub

1. Repo: https://github.com/C-albert-duan/MatchRead
2. Protect `main`: PR required, linear history, squash merges.
3. Required checks (when CI exists): lint/types/tests, web build.

## 2. Supabase

1. Project `opugihofwvunwkpcmboq` — URL + anon key → Vercel + `.env.docker`.
2. Auth → URL configuration: localhost:3001, Vercel Preview pattern, production domain. **Never** `0.0.0.0` or parking domains.
3. Migrations `0001`–`0006` applied.
4. **Custom SMTP** required for invite waves — [SMTP.md](./runbooks/SMTP.md).

**Never** put the service-role key in the web app or Vercel.

## 3. Vercel

1. Import the GitHub repo.
2. **Root Directory:** `apps/web` (uses committed `apps/web/vercel.json` for monorepo `npm ci` / build).
3. Env:

   | Variable | Preview | Production |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | ● | ● |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ● | ● |
   | `NEXT_PUBLIC_SITE_URL` | — (omit; browser origin used) | ● canonical HTTPS |
   | `FOUNDER_EMAILS` | ○ | ○ recommended |

4. Confirm `SUPABASE_SERVICE_ROLE_KEY` and any `RAPIDAPI_*` are **absent**.
5. Prove magic link on Preview before inviting anyone.

## 4. Order of first go-live

1. Supabase project + Auth URLs + SMTP  
2. Vercel Preview with anon env  
3. Prove magic-link round trip on Preview  
4. Migrations + create/join league on Preview  
5. Arm settlement only after grading is tested (see runbooks)

## Domain

Planned: `matchreadtennis.com` — connect after Preview auth works; set Production `NEXT_PUBLIC_SITE_URL` and Auth allow-list.

## 5. Docker (local)

Day-to-day local work is **Docker-only**. See [DOCKER.md](./DOCKER.md).

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```
