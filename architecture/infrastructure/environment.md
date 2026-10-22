# Infrastructure: Environment and secrets

Where credentials live. Never put service role or provider keys in the web bundle.

## Web (`apps/web`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (RLS) |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin (local default `http://localhost:3001`) |
| `FOUNDER_EMAILS` | Optional founder gate (server) |
| `SENTRY_DSN` | Optional. Server error reporting. Unset locally; the SDK stays disabled |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional. Browser DSN, inlined at build. Unset locally |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Optional. Source map upload only. All three must be set |

Validated in `apps/web/lib/env.ts` for the Supabase URL, anon key, and site origin. Sentry variables are optional and are not required to start the app. **No** `SUPABASE_SERVICE_ROLE_KEY` on the web app.

### Sentry receipt — BLOCKED

Checked 2026-10-07. `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are unset in `.env.local` and in the process environment. `.env.docker` is absent. No client exception was sent, and no Sentry project was queried. Integration code is in place; receipt is not proven. Client capture, once a public DSN is set, is `ErrorReporter` → `reportError` → `@sentry/nextjs`. There is no public debug route.

Docker: copy `.env.docker.example` → `.env.docker`, then `docker compose --env-file .env.docker up --build`.

| Variable | Purpose |
|----------|---------|
| `WEB_PORT` | Host port mapped to web container (default 3001) |

## Edge / Vault

| Secret | Purpose |
|--------|---------|
| `INGEST_SECRET` | Bearer for sync-facts / settle invoke |
| `SENTRY_DSN` | Optional. `sync-facts` and `settle-leagues` report errors only when this secret is set |
| `RAPIDAPI_KEY` | Tennis API |
| Service role | Inside Edge for fact writes |
| Vault `project_url` + `ingest_secret` | pg_cron → HTTP invoke |

## Ops scripts (`.env.provider`)

| Variable | Purpose |
|----------|---------|
| `RAPIDAPI_KEY`, `RAPIDAPI_HOST` | Provider probes, publish, reconcile, and `connectLive` |
| `MATCHREAD_INGEST_URL` | POST target — use `.../functions/v1/sync-facts`. The listener rewrites a legacy `/ingest-events` suffix |
| `LISTENER_POLL_MS` | Repeats the listener. Unset runs one cycle. Required on Railway |
| `LISTENER_DRY_RUN` | Optional. `1` logs changes and does not post frames or the 30-second heartbeat |
| `FEED_SHAPE` | Unset. `snapshot` or `delta` is a label. Absence does not remove a row |
| `RAILWAY_REPLICA_ID` | Set by Railway. Sent as `listenerInstanceId`. Not a lock |
| `PORT` | Health server. Railway sets `8080`. Unset locally uses `8080` |
| `INGEST_SECRET` | Same as Supabase Edge secret |

## Listener deploy (Railway)

The process reads runtime variables only. `apps/listener/Dockerfile` has no `ARG` for a credential, and env files are excluded from the build context.

| Variable | Where it lives |
|----------|----------------|
| `RAPIDAPI_KEY`, `RAPIDAPI_HOST` | Railway secret (`preserve()`). Not a build argument |
| `MATCHREAD_INGEST_URL`, `INGEST_SECRET` | Railway secret. Bearer for `sync-facts` |
| `LISTENER_POLL_MS` | Railway variable. Required there so the process keeps polling |
| `PORT` | `8080` in `.railway/railway.ts`. `GET /health` |
| `RAILWAY_REPLICA_ID` | Injected by Railway |

The listener does not take `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`, or `SENTRY_AUTH_TOKEN`. Writes stay in `sync-facts`, which holds the service role in Supabase secrets.
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

See `apps/web/e2e/live-checklist.spec.ts` and [ops-scripts.md](./ops-scripts.md). `apps/web/e2e/live-client.spec.ts` opens a local draw and checks a live score change, a realtime reconnect, a foreground refetch, the stale badge, a provisional final that does not fill the next seat, and the official sheet replacing that provisional line. That app is a second Next dev server with `E2E_SUPABASE_URL` and `E2E_SUPABASE_ANON_KEY` set to the local project. `next.config.js` copies those onto the public Supabase env and uses `.next-e2e`, so `.env.local` and the other dev server stay on the hosted project. `apps/web/e2e/raw-html.spec.ts` fetches `/` and `/tournaments` with `request.get` and reads that response body. It does not open the page after hydration. The body must include the landing line or tournament rows, and must not include the `page-skeleton` shell. The landing document also has no back control.

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
