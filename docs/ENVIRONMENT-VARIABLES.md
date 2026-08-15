# Environment variables

Adapted from `Wireframe/MatchRead-main/Engineer Handoff/ENVIRONMENT-VARIABLES.md`.

**No real values in this file.** Placeholders are `<angle-bracketed>`.

## The one rule that matters

`SUPABASE_SERVICE_ROLE_KEY` is permitted in:

1. Supabase Edge Functions (platform-injected)
2. A launch engineer's local shell for one-off ops

**Never on Vercel. Never in committed `.env*` files. Never in the browser or any `NEXT_PUBLIC_*` variable.**

`RAPIDAPI_KEY` lives in **Supabase Edge secrets** (`npx supabase secrets set RAPIDAPI_KEY=...`). The 5-minute clock is `pg_cron` inside the same project (Vault names `project_url` + `ingest_secret`). Never put the RapidAPI key on Vercel, GitHub, the domain, SQL migrations, or `NEXT_PUBLIC_*`.

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

## Production sync (Supabase secrets + Edge)

| Variable | Where |
|---|---|
| `RAPIDAPI_KEY` | `npx supabase secrets set` — read only by `sync-tennis` |
| `RAPIDAPI_HOST` | Optional secret; default host is fine |
| `INGEST_SECRET` | Edge secret **and** Vault name `ingest_secret` (same value) |
| `project_url` | Vault — `https://<ref>.supabase.co` (no trailing path) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Injected in Edge Functions |

Runbook: [runbooks/SYNC-TENNIS.md](./runbooks/SYNC-TENNIS.md).

## Local worker (`apps/worker`, optional)

Same jobs as `sync-tennis`, from `.env.provider` on a laptop. Not the production path.

| Variable | Where |
|---|---|
| `RAPIDAPI_KEY` | `.env.provider` — **never Vercel** |
| `RAPIDAPI_HOST` | `tennis-api-atp-wta-itf.p.rapidapi.com` |
| `MATCHREAD_INGEST_URL` / `INGEST_SECRET` | Worker → `ingest-events` / `rebuild-draw` |
| `WORKER_PUBLISH_MS` / `WORKER_RECONCILE_MS` | Worker poll intervals (default 15m / 60s) |

## Observability

Live without third-party keys: `ops_events` (anon insert, authenticated read on `/founder`). Sentry / PostHog still fire when those keys are set.

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Optional extra browser error reports |
| `SENTRY_DSN` | Optional extra server reports |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional extra product events |
| `NEXT_PUBLIC_POSTHOG_HOST` | Optional; default `https://us.i.posthog.com` |

## Rotation

Anon key leak is not an emergency if RLS is correct — rotate in Supabase → update Vercel → redeploy.
