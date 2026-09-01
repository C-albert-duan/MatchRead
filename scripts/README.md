# Ops scripts

Operator and CI tooling. Full detail: [architecture/infrastructure/ops-scripts.md](../architecture/infrastructure/ops-scripts.md).

Env: copy `.env.provider.example` → `.env.provider` (gitignored).

| Script | npm alias | When to run |
|--------|-----------|-------------|
| `publish-draws.mjs` | `npm run publish:draws` | Publish verified official draw → POST `sync-facts` |
| `reconcile-results.mjs` | `npm run reconcile:results` | Map-driven results reconcile (optional `--map`) |
| `sync-lock-at.mjs` | `npm run sync:lock-at` | Refresh `lock_at` from first timed R0 ball |
| `probe-rapidapi.mjs` | `npm run probe:rapidapi` | Provider connectivity smoke test |
| `probe-event-dates.mjs` | `npm run probe:event-dates` | Read-only calendar/date diagnosis |
| `tennis-verify.mjs` | `npm run tennis:verify -- --slug …` | Integrity vs DB (+ optional live provider) |
| `preflight-trust-boundary.mjs` | `npm run preflight:trust` | Trust checks (`--live` for hosted probe) |
| `ci-consumer-boundary.mjs` | `npm run ci:consumer-boundary` | CI: web uses `public_calendar` only |
| `verify-settlement-math.mjs` | `npm run verify:settlement` | Offline scoring invariant (CI) |
| `backfill-settle-advance.mjs` | — | One-shot: re-bind results + parent advance |
| `docker-migrate.mjs` | — | `docker compose --profile migrate` only |
| `apply-sql-migration.mjs` | — | Apply one SQL via Management API |
| `e2e-live-pipeline.mjs` | — | Apply `e2e-live-setup.sql` / cleanup |
| `e2e-live-run-auth.mjs` | — | Run authenticated live Playwright checklist |

Typical flow: `probe:rapidapi` → `tennis:verify` → `publish:draws` → wait for cron / `reconcile:results` → `settle-leagues` or founder settle.
