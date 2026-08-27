# Infrastructure: Environment and secrets

Where credentials live. Never put service role or provider keys in the web bundle.

## Web (`apps/web`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (RLS) |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin |
| `FOUNDER_EMAILS` | Optional founder gate (server) |

Validated in `apps/web/lib/env.ts`. **No** `SUPABASE_SERVICE_ROLE_KEY` on the web app.

Docker: copy `.env.docker.example` → `.env.docker`, then `docker compose --env-file .env.docker up --build`.

## Edge / Vault

| Secret | Purpose |
|--------|---------|
| `INGEST_SECRET` | Bearer for sync-facts / settle invoke |
| `RAPIDAPI_KEY` | Tennis API |
| Service role | Inside Edge for fact writes |
| Vault `project_url` + `ingest_secret` | pg_cron → HTTP invoke |

## Ops scripts

| File | Purpose |
|------|---------|
| `.env.provider` (example) | RapidAPI + ingest URL for publish/reconcile/probes |
| Root `.env*.example` | Documented templates |

## Rule of thumb

```text
Browser / Next     → anon + user JWT
Edge / cron / ops  → ingest secret + service role + provider key
```

## Related

- Trust boundaries: [../overview.md](../overview.md)  
- Edge: [edge-functions.md](./edge-functions.md)
