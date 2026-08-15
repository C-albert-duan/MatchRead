# Runbook — Local tennis-facts worker (optional)

Always-on process in `apps/worker`. **Production live ingestion is 5-minute REST `sync-tennis`** ([SYNC-TENNIS.md](./SYNC-TENNIS.md)). That poll is the production listener: deployed, authenticated with Vault `ingest_secret`, mapped, saved, and retried every 5 minutes. Use this worker only on a laptop or Docker when you want the optional Mega socket.

Vercel stays the Next.js app only. Do not put `RAPIDAPI_*` or `INGEST_SECRET` on Vercel.

## What it does

Same jobs as `sync-tennis`:

1. Every `WORKER_PUBLISH_MS` (default 15m): official Mega draw + fixtures → `rebuild-draw`.
2. Every `WORKER_RECONCILE_MS` (default 60s): finished results + live events → `ingest-events`.
3. Mega Socket.IO (`live.matchstat.com`) when `ws-token` works — finished events trigger an extra reconcile. Odds are ignored.
4. `/health` on `PORT` (default 8080).

It does **not** write Postgres with a service role. It does **not** settle brackets.

## Local

```bash
# one cycle (publish + reconcile), then exit
npm run worker:once -- --dry-run

# live one-shot (needs MATCHREAD_INGEST_URL + INGEST_SECRET)
npm run worker:once

# always-on
npm run worker
```

Compose:

```bash
docker compose --env-file .env.docker --env-file .env.provider --profile worker up --build worker
```

Env (`.env.provider`):

| Variable | Required |
|---|---|
| `RAPIDAPI_KEY` | yes |
| `RAPIDAPI_HOST` | default host is fine |
| `MATCHREAD_INGEST_URL` | `https://<ref>.supabase.co/functions/v1/ingest-events` |
| `INGEST_SECRET` | same as Edge secret |
| `NEXT_PUBLIC_SUPABASE_URL` | anon read of calendar / seats / maps |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon read |

## Production

Do not deploy this to Railway unless you later need an always-on socket. REST poll is `sync-tennis`.
