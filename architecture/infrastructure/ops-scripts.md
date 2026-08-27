# Infrastructure: Ops scripts

**Path:** `scripts/`  
**Role:** Operator and CI tooling around ingest, integrity, and migrate. Not product UI.

| Script | npm / usage | Responsibility |
|--------|-------------|----------------|
| `publish-draws.mjs` | `npm run publish:draws` | Preview official seats; live publish via sync-facts / apply-draw |
| `reconcile-results.mjs` | `npm run reconcile:results` | Map-driven RapidAPI results → ingest |
| `sync-lock-at.mjs` | `npm run sync:lock-at` | Set `lock_at` from first timed R0 ball |
| `probe-rapidapi.mjs` | `npm run probe:rapidapi` | Provider connectivity |
| `probe-event-dates.mjs` | `npm run probe:event-dates` | Read-only date/fixture diagnosis |
| `tennis-verify.mjs` | `npm run tennis:verify` | `evaluateDrawIntegrity` vs DB (+ optional live) |
| `preflight-trust-boundary.mjs` | `npm run preflight:trust` | Repo (+ optional live) trust checks |
| `ci-consumer-boundary.mjs` | `npm run ci:consumer-boundary` | CI: public consumers must use `public_calendar` |
| `verify-settlement-math.mjs` | `npm run verify:settlement` | Offline scoring invariant (128 → max 512) |
| `backfill-settle-advance.mjs` | one-shot | Re-bind results + parent advance |
| `docker-migrate.mjs` | migrate profile | Apply migrations via `DATABASE_URL` |
| `apply-sql-migration.mjs` | manual | Apply one SQL via Management API |
| `e2e-live-*.mjs` + `.sql` | live E2E | Fixture setup/cleanup |

## Typical operator flow

1. `probe:rapidapi` / `probe:event-dates` — confirm provider truth.
2. `tennis:verify` / `preflight:trust` — integrity before publish.
3. `publish:draws` — write verified official field.
4. `reconcile:results` / wait for cron `sync-facts` — settle match facts.
5. Cron `settle-leagues` (or founder settle) — score brackets.

## Related

- Provider: [../modules/provider-rapidapi.md](../modules/provider-rapidapi.md)  
- Flows: [../data-flows.md](../data-flows.md)  
- Env: [environment.md](./environment.md)
