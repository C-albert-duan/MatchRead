# Environment variables

Adapted from `Wireframe/MatchRead-main/Engineer Handoff/ENVIRONMENT-VARIABLES.md`.

**No real values in this file.** Placeholders are `<angle-bracketed>`.

## The one rule that matters

`SUPABASE_SERVICE_ROLE_KEY` is permitted in:

1. Supabase Edge Functions (platform-injected)
2. Railway listener (when built)
3. A launch engineer's local shell for one-off ops

**Never on Vercel. Never in committed `.env*` files. Never in the browser or any `NEXT_PUBLIC_*` variable.**

## Vercel / `apps/web`

| Variable | Visibility | Local | Preview | Prod |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | ● | ● | ● |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | ● | ● | ● |
| `NEXT_PUBLIC_SITE_URL` | public | ○ Docker/local | — **omit on Preview** | ● canonical domain |
| `FOUNDER_EMAILS` | server-only | ○ | ○ | ○ recommended |

On the **client**, magic-link `emailRedirectTo` uses `window.location.origin` (see `site-url-client.ts`) so Preview always matches the deployment host. Set `NEXT_PUBLIC_SITE_URL` on Production for server-side absolute URLs and consistency.

`FOUNDER_EMAILS` — comma-separated emails allowed to open `/founder` and `/founder/disruption`. If unset or empty, any signed-in user is allowed (private beta) and founder pages show a clear beta banner.

Must **not** be present on Vercel: `SUPABASE_SERVICE_ROLE_KEY`, any `RAPIDAPI_*`.

## Local / Docker `.env` (gitignored)

**Primary:** copy `.env.docker.example` → `.env.docker` and run Compose (see [DOCKER.md](./DOCKER.md)).

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3001
# FOUNDER_EMAILS=you@example.com,ops@example.com
```

Do not use host `npm install` / `apps/web/.env.local` for day-to-day work — Compose does not load `.env.local`.

## Local provider `.env.provider` (gitignored)

Copy `.env.provider.example` → `.env.provider`. Used by RapidAPI probe/reconcile scripts only — **not** loaded by the web Docker service.

```
RAPIDAPI_KEY=...
RAPIDAPI_HOST=tennis-api-atp-wta-itf.p.rapidapi.com
# MATCHREAD_INGEST_URL=https://<ref>.supabase.co/functions/v1/ingest-events
# INGEST_SECRET=...
```

Mapping for reconcile: copy `.provider-map.example.json` → `.provider-map.json` (gitignored). See [RECONCILE-RESULTS.md](./runbooks/RECONCILE-RESULTS.md).

## Edge functions / listener (later)

| Variable | Where |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Injected in Edge Functions |
| `RAPIDAPI_KEY` | Provider worker / local probe scripts only — never Vercel |
| `RAPIDAPI_HOST` | `tennis-api-atp-wta-itf.p.rapidapi.com` (same places as key) |
| `MATCHREAD_INGEST_URL` / `INGEST_SECRET` | Worker → `ingest-events` |

Plan: [plans/15-rapidapi-tennis-provider.md](./plans/15-rapidapi-tennis-provider.md).

## Deferred: PostHog / Sentry

Not required for invited beta. Do **not** add SDKs until chosen. When ready:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` / host | Client analytics — only if product opts in |
| `SENTRY_DSN` (server) / `NEXT_PUBLIC_SENTRY_DSN` | Error reporting — only if product opts in |

Leave unset until then; no stubs beyond this note.

## Rotation

Anon key leak is not an emergency if RLS is correct — rotate in Supabase → update Vercel → redeploy.
