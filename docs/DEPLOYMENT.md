# Deployment — GitHub · Vercel · Supabase

## 1. GitHub

1. Create repo (e.g. `MatchRead` or `mh-2`).
2. Push this workspace root (includes `Wireframe/`, `docs/`, `apps/`, `packages/`, `supabase/`).
3. Protect `main`: PR required, linear history, squash merges.
4. Required checks (when CI exists): lint/types/tests, web build.

## 2. Supabase

1. Create project.
2. Copy Project URL + anon key → Vercel + local `.env`.
3. Auth → URL configuration: add `http://localhost:3000/**`, Vercel preview pattern, production domain.
4. Apply migrations: `pnpm db:migrate` (or `supabase db push`).
5. For beta email volume, configure custom SMTP (Supabase built-in sender is heavily rate-limited).

**Never** put the service-role key in the web app or Vercel.

## 3. Vercel

1. Import the GitHub repo.
2. Set root / app directory to `apps/web` (or monorepo settings that build that package).
3. Env (Production):

   | Variable | Notes |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Required |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required |
   | `NEXT_PUBLIC_SITE_URL` | Production only, e.g. `https://matchreadtennis.com` |

4. Preview: do **not** set `NEXT_PUBLIC_SITE_URL` (use `VERCEL_URL` for auth callbacks).
5. Confirm `SUPABASE_SERVICE_ROLE_KEY` and any `RAPIDAPI_*` are **absent**.

## 4. Order of first go-live

1. Supabase project + Auth URLs  
2. Vercel preview with anon env  
3. Prove magic-link round trip  
4. Migrations + create/join league  
5. Arm settlement only after grading is tested (see runbooks)

## Domain

Planned: `matchreadtennis.com` — connect after auth + growth loop work on preview.
