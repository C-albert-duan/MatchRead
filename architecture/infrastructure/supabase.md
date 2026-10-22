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
| 0022 | `matches.official_score` + `fact_kind` |
| 0023 | Public `matches.external_ref`, `session`, `court`; view `tournament_match_sheet` |
| 0024 | `matches.session` is `day`, `night`, or null. No slate-date index |
| 0025 | UTC midnight on `matches.scheduled_at` is not a kickoff. No `starts_at` |
| 0027 | `live_match_state` (anon select, realtime) and `listener_health` (authenticated select). Live rows are not official results |
| 0028 | `upsert_live_match_state` is monotonic and does not update `matches`. `listener_health.frames_disagreement`. The `provider_event_map` view from this file is replaced by 0029 |
| 0029 | Table `provider_event_map`. Unique `(tour, provider_event_id)` is the live-list id plus `tourType`. `match_id` is indexed and is not granted to anon or authenticated. service_role writes |
| 0030 | `unmapped_live_events`. Raw payload for a live row that did not map. No `match_id`. service_role inserts. Authenticated may select |
| 0031 | `live_match_state.occurred_at`. One current row per match. `upsert_live_match_state` replaces that row |
| 0032 | Canonical `score_text` and `points_text`. `flag` is derived. `received_at` is receipt. `stats` cannot store the raw payload |
| 0033 | `live_match_state_tournament_phase_idx` and `live_match_state_flag_idx` (`flag` not null). No separate `flag = 'live'` index |
| 0034 | `live_match_state` select for `anon` and `authenticated`. No browser write grant. `service_role` inserts, updates, and deletes |
| 0035 | `live_match_state` on `supabase_realtime` with replica identity full. Postgres Changes for every tournament share that publication |
| 0036 | `sweep_terminal_live_state`. `invoke_sync_facts` sweeps `provisional_final` rows older than 24 hours, then posts `sync-facts` |
| 0037 | `upsert_live_match_state` is monotonic on `occurred_at`. `received_at` does not order the row |
| 0038 | `listener_health.instance_id`. Last listener process. Not a leader lock |
| 0039 | `listener_health` latest tick: `events_received`, `mapped_count`, `unmapped_count`, `lag_ms`, `token_age_s`, `last_heartbeat_at`. Written on row id `listener` |
| 0040 | `platform_events`. One raw provider row per content hash. Authenticated may select. service_role inserts. No `live_events` table |

`migrations/archive/` is superseded history — do not treat as live.

`supabase/fixtures/synthetic-bracket-16.sql` is a 16-player replay fixture. pgTAP includes the same script from `supabase/tests/fixtures/` inside `31_match_structure.test.sql`, which rolls the insert back. It is `force_off`, so it is not part of the migration chain and not on `public_calendar`.

## RLS mental model

| Domain | Select | Write |
|--------|--------|-------|
| Facts (`tournaments`, `players`, `seats`, `matches`) | anon + authenticated | service_role / security definer only |
| Product (leagues, members, brackets, picks, invites) | authenticated members | Via RPCs as definer |
| Ops (`ops_events`, repairs, claims, integrity) | authenticated (mostly) | Mostly service |
| `provider_event_map` | authenticated on `tour`, `provider_event_id`, `mapped_at` only | service_role |
| `unmapped_live_events` | authenticated | service_role insert |
| `platform_events` | authenticated | service_role insert. Unique `content_hash` |
| `public_calendar` | anon + authenticated | View (eligible only) |
| `live_match_state` | anon + authenticated | service_role |

## Important RPCs / functions

Product (examples from 0006 / 0008 / 0011):

- `save_picks`, `submit_bracket`
- `create_league`, `ensure_solo_league`, `join_with_invite`
- `lock_league_event`, member invite CRUD

Facts / settle:

- `draw_is_official`, `refresh_lock_at`
- `claim_settlement`, `unwind_settlement_parent`, `matches_before_winner_change`
- `is_bracket_product`

## Cron

Migrations schedule two jobs. That is the definition in SQL, not proof that a hosted job has run.

| Role | Job name | Schedule in SQL | Command |
|------|----------|-----------------|---------|
| Reconciliation | `sync-facts-5m` | `*/5 * * * *` (`0009_sync_facts_cron.sql`) | `select public.invoke_sync_facts();` — sweeps terminal live rows, then POSTs `sync-facts` |
| Settlement | `settle-leagues` | `*/15 * * * *` (`0007_cron.sql`) | `select public.invoke_settle_leagues();` |

`0009` unschedules `sync-tennis-5m` / `sync-tennis-30m` and does not reschedule `settle-leagues`. Archive files that name `settle-leagues-5m` or `sync-tennis-30m` are not the live chain.

### Hosted run history — BLOCKED

`npm run prove:cron` exits **2** when `DATABASE_URL` / `SUPABASE_DB_URL` is unset. It exits **1** when the database is reachable but Vault `project_url` and `ingest_secret` are not both set. Exit **0** means jobs are active, latest runs succeeded, and Vault is configured. Rules live in `scripts/lib/cron-proof.mjs`.

On 2026-10-07 it exited 2: `DATABASE_URL` is not set and `SUPABASE_DB_URL` is not set. Hosted `cron.job` / `cron.job_run_details` were not read.

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

- `npm run test:db` → `npx supabase test db`, then the absence-classification integration test and `live-ingest.integration.test.js` against this local database
- SQL tests under `supabase/tests/` (eligibility, reconciliation, scoreline fill, event dates, lock write, match session, …). `46_live_state_access.test.sql` checks `live_match_state`: anon and authenticated may select, service_role may write, browser roles cannot write, `match_id` and `public_ref` reject a second row, the phase and flag indexes exist, and phase is `in_play`, `suspended`, or `provisional_final`
- `packages/provider-rapidapi/src/absence-gap.integration.test.js` reads `seats` from local Postgres, classifies with `classifyPlayerAbsences`, writes `ops_events`, and calls `claim_settlement` only when the absence does not block

## Related

- ERD: [../data-model.md](../data-model.md)  
- Flows: [../data-flows.md](../data-flows.md)
