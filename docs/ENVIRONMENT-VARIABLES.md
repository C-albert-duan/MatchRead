# Environment variables

Adapted from `Wireframe/MatchRead-main/Engineer Handoff/ENVIRONMENT-VARIABLES.md`.

**No real values in this file.** Placeholders are `<angle-bracketed>`.

## The one rule that matters

`SUPABASE_SERVICE_ROLE_KEY` is permitted in:

1. Supabase Edge Functions (platform-injected)
2. Railway listener (when built)
3. A launch engineer's local shell for one-off ops

**Never on Vercel. Never in committed `.env*` files.**

## Vercel / `apps/web`

| Variable | Visibility | Local | Preview | Prod |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | ● | ● | ● |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | ● | ● | ● |
| `NEXT_PUBLIC_SITE_URL` | public | ○ | — | ● |

Must **not** be present on Vercel: `SUPABASE_SERVICE_ROLE_KEY`, any `RAPIDAPI_*`.

## Local `.env` (gitignored)

Copy from repo root `.env.example`.

## Edge functions / listener (later)

| Variable | Where |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Injected in Edge Functions |
| `RAPIDAPI_KEY` / provider host | Listener only |

## Rotation

Anon key leak is not an emergency if RLS is correct — rotate in Supabase → update Vercel → redeploy.
