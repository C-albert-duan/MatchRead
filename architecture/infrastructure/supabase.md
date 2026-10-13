# Infrastructure: Supabase database

**Path:** `supabase/migrations/`, `supabase/tests/`  
**Role:** Schema, RLS, security-definer RPCs, views, and pg_cron → Edge invoke helpers.

Hosted Supabase is the system of record. Local Docker runs the **web app only**; DB/Auth/API stay hosted (or CLI outside Compose).

## Migration chain (live)

| # | File theme |
|---|------------|
| 0001 | Profiles ↔ auth.users |
| 0002 | Tournaments, players, seats; `draw_is_official` |
| 0003 | Matches; `refresh_lock_at` |
| 0004 | Leagues, members, invites, league_tournaments |
| 0005 | Brackets, picks, `season_points` |
| 0006 | RLS + product RPCs (`save_picks`, `create_league`, …) |
| 0007 | Cron helpers (settle + legacy) |
| 0008 | Member invite RPCs (kick/leave/reissue) |
| 0009 | Cron → `sync-facts` every 5m |
| 0010–0011 | Calendar uniqueness / solo naming |
| 0012 | Draw revisions, event_map |
| 0013 | Trust boundary, tier, ops_events, repair audit |
| 0014 | `main_draw_starts_on` vs week `starts_on` |
| 0015 | `settlement_claims` |
| 0016 | `force_off`-only override; `public_calendar` |
| 0017 | Publish requires integrity report |
| 0018 | Restore product `main_draw_starts_on` after calendar overwrite |
| 0019 | Publish trigger uses `is_bracket_product()` (generated column null in trigger) |
| 0020 | Clear misclassified qualifying seats (`t-wta-16743`) for main rediscovery |
| 0021 | `draw_replacements.change_kind` allows `bye_to_tbd` / `tbd_to_bye` |
| 0022 | `matches.official_score` and `fact_kind` |

`migrations/archive/` is superseded history — do not treat as live.

## RLS mental model

| Domain | Select | Write |
|--------|--------|-------|
| Facts (`tournaments`, `players`, `seats`, `matches`) | anon + authenticated | service_role / security definer only |
| Product (leagues, members, brackets, picks, invites) | authenticated members | Via RPCs as definer |
| Ops (`ops_events`, repairs, claims, integrity) | authenticated (mostly) | Mostly service |
| `public_calendar` | anon + authenticated | View (eligible only) |

## Important RPCs / functions

Product (examples from 0006 / 0008 / 0011):

- `save_picks`, `submit_bracket`
- `create_league`, `ensure_solo_league`, `join_with_invite`
- `lock_league_event`, member invite CRUD

Facts / settle:

- `draw_is_official`, `refresh_lock_at`
- `claim_settlement`, `unwind_settlement_parent`
- `is_bracket_product`

## Cron

Migrations schedule two jobs. That is the definition in SQL, not proof that a hosted job has run.

| Role | Job name | Schedule in SQL | Command |
|------|----------|-----------------|---------|
| Reconciliation | `sync-facts-5m` | `*/5 * * * *` (`0009_sync_facts_cron.sql`) | `select public.invoke_sync_facts();` |
| Settlement | `settle-leagues` | `*/15 * * * *` (`0007_cron.sql`) | `select public.invoke_settle_leagues();` |

`0009` unschedules `sync-tennis-5m` / `sync-tennis-30m` and does not reschedule `settle-leagues`. Archive files that name `settle-leagues-5m` or `sync-tennis-30m` are not the live chain.

### Hosted run history — BLOCKED

`npm run prove:cron` on 2026-10-07 exited 2: `DATABASE_URL` is not set and `SUPABASE_DB_URL` is not set. Hosted `cron.job` / `cron.job_run_details` were not read.

The local database, queried the same day, has both jobs `active` with those schedules. Latest local rows were `succeeded` at `2026-10-07T18:00:00Z` with `return_message` `1 row`. Local Vault has no `project_url` or `ingest_secret`, so those rows are the SQL function returning without `net.http_post`. They are not Edge executions. Detail is in [docs/provider-capture-findings.md](../../docs/provider-capture-findings.md).

```sql
select *
from cron.job_run_details
order by start_time desc
limit 20;

select jobname, schedule, active
from cron.job;
```

See also [edge-functions.md](./edge-functions.md).

## Tests

- `npm run test:db` → `npx supabase test db`, then the absence-classification integration test against this local database
- SQL tests under `supabase/tests/` (eligibility, reconciliation, scoreline fill, event dates, lock write, …)
- `packages/provider-rapidapi/src/absence-gap.integration.test.js` reads `seats` from local Postgres, classifies with `classifyPlayerAbsences`, writes `ops_events`, and calls `claim_settlement` only when the absence does not block

## Related

- ERD: [../data-model.md](../data-model.md)  
- Flows: [../data-flows.md](../data-flows.md)
