# Infrastructure: Environment and secrets

Where credentials live. Never put service role or provider keys in the web bundle.

## Web (`apps/web`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (RLS) |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin (local default `http://localhost:3001`) |
| `FOUNDER_EMAILS` | Optional founder gate (server) |

Validated in `apps/web/lib/env.ts`. **No** `SUPABASE_SERVICE_ROLE_KEY` on the web app.

Docker: copy `.env.docker.example` → `.env.docker`, then `docker compose --env-file .env.docker up --build`.

| Variable | Purpose |
|----------|---------|
| `WEB_PORT` | Host port mapped to web container (default 3001) |

## Edge / Vault

| Secret | Purpose |
|--------|---------|
| `INGEST_SECRET` | Bearer for sync-facts / settle invoke |
| `RAPIDAPI_KEY` | Tennis API |
| Service role | Inside Edge for fact writes |
| Vault `project_url` + `ingest_secret` | pg_cron → HTTP invoke |

## Ops scripts (`.env.provider`)

| Variable | Purpose |
|----------|---------|
| `RAPIDAPI_KEY`, `RAPIDAPI_HOST` | Provider probes, publish, reconcile |
| `MATCHREAD_INGEST_URL` | POST target — use `.../functions/v1/sync-facts` |
| `INGEST_SECRET` | Same as Supabase Edge secret |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Script reads tournaments / verify |

Legacy URLs ending in `/ingest-events` or `/rebuild-draw` are rewritten by ops scripts.

| File | Purpose |
|------|---------|
| `.provider-map.json` | Optional map for `reconcile:results` (gitignored; see `.provider-map.example.json`) |

## Migrate profile (Docker)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres URI for `docker compose --profile migrate` |

## Live E2E / Playwright (manual, not CI)

| Variable | Purpose |
|----------|---------|
| `LIVE_BASE_URL` | Production URL (default `https://www.matchreadtennis.com`) |
| `LIVE_REF` | Tournament slug for checklist (e.g. `t-atp-21349`) |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | Auth helper for live-checklist-auth |
| `SUPABASE_PROJECT_REF` | Management API in `e2e-live-run-auth.mjs` |

See `apps/web/e2e/live-checklist.spec.ts` and [ops-scripts.md](./ops-scripts.md).

## Templates

| File | Purpose |
|------|---------|
| `.env.example` | Web vars (non-Docker) |
| `.env.docker.example` | Compose web + migrate |
| `.env.provider.example` | Ops / ingest |

## Rule of thumb

```text
Browser / Next     → anon + user JWT
Edge / cron / ops  → ingest secret + service role + provider key
```

## Related

- Trust boundaries: [../overview.md](../overview.md)  
- Edge: [edge-functions.md](./edge-functions.md)
