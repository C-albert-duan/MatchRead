# Runbook — First production / preview deploy

## Prerequisites

- GitHub repo with this codebase
- Supabase project
- Vercel project linked to repo

## Steps

1. Copy `.env.example` → `.env.local` in `apps/web` (or root per tooling).
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase → Settings → API.
3. Supabase Auth → URL configuration: add localhost and Vercel URLs.
4. Deploy Vercel Preview with the two public env vars (no `SITE_URL` on Preview).
5. Open `/sign-in` on the preview URL; send a magic link to yourself.
6. Confirm callback lands on the preview host and session persists.
7. Apply initial migrations when schema exists (`supabase db push` / `pnpm db:migrate`).
8. Smoke: create league → invite → join on a second email.
9. Production: set `NEXT_PUBLIC_SITE_URL` to the canonical domain and reconnect Auth allow-list.

## Failure modes

| Symptom | Likely cause |
|---|---|
| Link opens localhost | `SITE_URL` wrong or missing on prod |
| Preview auth goes to prod | `NEXT_PUBLIC_SITE_URL` set on Preview |
| Email never arrives | SMTP / rate limit |
| Session lost | Middleware not returning refreshed response cookies |
