# Infrastructure: CI and deploy

## Local / Docker (web)

`docker-compose.yml` — Docker-only web runtime (no host npm required for day-to-day):

| Service | Role |
|---------|------|
| `web` | Dev Next.js with bind-mounted `apps/` + `packages/` |
| `web-prod` | Profile `prod` — standalone runner image |
| `migrate` | Profile `migrate` — apply SQL via `DATABASE_URL` |

App default: http://localhost:3001  
Supabase Auth/API/DB stay **hosted** (or CLI outside Compose). Local Auth redirect URLs: `supabase/config.toml` (`site_url` = 3001).

Root Dockerfile multi-stage: development → runner. It builds the web app. `apps/listener` is an npm workspace in that install and is not a Compose service.

The listener container is `.railway/railway.ts`: one replica, image `apps/listener/Dockerfile`, health check `GET /health` with a 120-second timeout. There is no `railway.json`. A second replica duplicates posts. Ingest dedupes them and records `listener_overlap`. Apply that file with the Railway CLI. This repo does not apply it from CI. `SIGTERM` aborts the provider client and an unfinished batch, skips the next reconnect, and posts one disconnected heartbeat before exit. Provider and ingest secrets are Railway variables, not image layers.

## GitHub Actions

| Workflow | Role |
|----------|------|
| `.github/workflows/ci.yml` | Lint, typecheck, tests, **consumer-boundary**, **live-trust**, settlement-math verify, build |
| `.github/workflows/sync-facts.yml` | Optional manual POST to `sync-facts` (ingest secret) |

Root `postinstall` runs **`patch-package`**. `patches/next+14.2.35.patch` fixes bundled `@vercel/og` (`index.node.js`) so WASM/font paths use `new URL(..., import.meta.url)` instead of `path.join(import.meta.url, …)` — required for `next/og` (`ImageResponse`, e.g. `app/apple-icon.tsx`) on Windows and in local `next build`. Re-apply or refresh the patch when upgrading Next.

Useful root scripts (also used in CI):

- `npm run verify:settlement`
- `npm run ci:consumer-boundary`
- `npm run ci:live-trust`
- `npm run test` / `test:provider` / `test:db`

`ci:live-trust` scans live implementation files only (`live-ingest.js`, `live-listener.mjs`, `project-live.ts`, `apps/listener/src`, the live client and browser island, and the other files listed in `scripts/ci-live-trust.mjs`). It fails if those files name `settleAll`, `apply_grades`, or `apply_bracket_state`. It does not scan tests, docs, or the league settle button. `packages/provider-rapidapi/src/live-frame.test.js` lists those three names on purpose, as the assertion that the live sources omit them. The type brand on `OfficialResults` and `live-ingest.integration.test.js` remain the other two checks.

## Database deploy

- Live chain: `supabase/migrations/0001`–`0040` (see [supabase.md](./supabase.md))
- Archive under `supabase/migrations/archive/` — **never apply on prod**
- Helpers: `scripts/docker-migrate.mjs`, `scripts/apply-sql-migration.mjs`
- Edge deploy: `supabase functions deploy sync-facts settle-leagues --no-verify-jwt`

## Related

- Env placement: [environment.md](./environment.md)  
- Ops after deploy: [ops-scripts.md](./ops-scripts.md)
