# Infrastructure: CI and deploy

## Local / Docker (web)

`docker-compose.yml` — Docker-only web runtime (no host npm required for day-to-day):

| Service | Role |
|---------|------|
| `web` | Dev Next.js with bind-mounted `apps/` + `packages/` |
| `web-prod` | Profile `prod` — standalone runner image |
| `migrate` | Profile `migrate` — apply SQL via `DATABASE_URL` |

App default: http://localhost:3001  
Supabase Auth/API/DB stay **hosted** (or CLI outside Compose).

Root Dockerfile multi-stage: development → runner.

## GitHub Actions

| Workflow | Role |
|----------|------|
| `.github/workflows/ci.yml` | Lint, typecheck, tests, settlement-math verify, build; consumer-boundary check |
| `.github/workflows/sync-tennis.yml` | Optional manual POST to `sync-facts` (same ingest secret) |

Useful root scripts (also used in CI):

- `npm run verify:settlement`
- `npm run ci:consumer-boundary`
- `npm run test` / `test:provider` / `test:db`

## Database deploy

- Live chain: `supabase/migrations/0001`–`0017`
- Helpers: `scripts/docker-migrate.mjs`, `scripts/apply-sql-migration.mjs`
- Edge deploy: `supabase functions deploy` for `sync-facts` and `settle-leagues`

## Related

- Env placement: [environment.md](./environment.md)  
- Ops after deploy: [ops-scripts.md](./ops-scripts.md)
