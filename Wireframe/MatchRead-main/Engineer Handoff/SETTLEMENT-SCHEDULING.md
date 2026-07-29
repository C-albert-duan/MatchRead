# Runbook — Settlement scheduling

**Severity if absent: S1 by omission.** Nothing is false; nothing happens at all.

This is the primary remaining beta blocker. Until settlement runs on a schedule, MatchRead
accepts brackets and never scores them: no result is frozen into a league,
`bracket_snapshots.previous_score` stays null forever, the Daily Check is honest and
permanently quiet, and season standings never move.

Every `pg_cron` call in this repository is currently a comment. This runbook arms them.

---

## STOP — read this first

**The two settlement Edge Functions cannot run as written.** They import their logic from
npm:

```ts
// supabase/functions/settle-tournament/index.ts
import { settleAll, supabaseSettlementClient } from 'npm:@matchread/settlement@^0.1.0';

// supabase/functions/settle-slate/index.ts
import { gradePrediction } from 'npm:@matchread/core@^0.1.0';
```

Neither package is published. `@matchread/settlement` is `"private": true`.
`@matchread/core` is unpublished and depends on `@matchread/i18n` — also `"private": true` —
through `workspace:*`, which npm cannot resolve at all. There is no import map, no
vendoring, and no publish step in CI.

**`supabase functions deploy` will succeed and the function will fail at runtime on module
resolution.** That is the worst shape of failure available: green deploy, silent 500 on
first invocation, and a stack trace about a module rather than about settlement.

### Fix this before scheduling anything

Three options, in the order I would try them.

**A. Publish `core` and `settlement` to a private npm scope.** Correct long-term and the
only option that keeps the functions as thin as they are. Requires an npm org, an
`NPM_TOKEN`, a release step in CI, and dropping `private: true` plus resolving the
`workspace:*` dependency to a real version. Half a day, and it makes edge-function
deployment a normal thing forever.

**B. Vendor a bundle per function.** `esbuild` the two packages into
`supabase/functions/_shared/` and import locally. No registry, no token, and the bundle is
committed — so it is a generated file that CI must regenerate and diff, exactly like
`database.types.ts`, or it goes stale silently. Fastest path to a working beta.

**C. Invoke `settleAll` from the Railway container instead of an Edge Function.** ADR-0018
already anticipates this for Slam scale: *"when a field exceeds roughly 100,000 brackets,
`settle-tournament` should move to Tier 1."* The container builds from the monorepo, so
`workspace:*` resolves natively and the problem disappears. If you are building the listener
anyway (`RAILWAY-WORKER.md`), **this is the cheapest total answer** — one container, both
jobs, no registry.

**Decide and write down which you chose.** The rest of this runbook is written for
`pg_cron` → Edge Function (A or B). If you choose C, the schedule moves into the container
and §3's cron entries become HTTP calls the container makes to itself; everything in §§4–7 is
unchanged because it describes the database's own accounting.

---

## 1. What invokes settlement, and what each part does

| Component | Trigger | Job |
|---|---|---|
| `settle-slate` | Ingest pipeline on terminal match state, plus a 5-minute sweep | Grades every ungraded prediction for one match using `gradePrediction` from `@matchread/core` — **the same function the app uses to preview a rating delta**, so the number a user is shown can never disagree with the number they are given |
| `settle-tournament` | Schedule, or manual POST | Calls `settleAll` from `@matchread/settlement`: scores brackets, writes `bracket_snapshots`, freezes finished events into league standings |
| `packages/settlement` | — | Where all the logic actually lives. **Nothing in either function computes anything** |

That split is deliberate and load-bearing. `settle-tournament` used to be seven hundred lines
of inline logic, and the consequence that mattered more than every other property of the code
combined was that **it could not be executed anywhere except Supabase** — no Node, no CI, no
test. The Reality Milestone had to reimplement the whole pass to run at all, and recorded
the result as its only blocker: *"The two implementations agreeing today is a fact about this
afternoon, not a property of the system."*

**If a score is wrong, it is wrong in `packages/settlement`, which is testable.** Every line
added to an Edge Function is a line CI cannot reach. Keep them short.

### How the effective date is determined

`settleAll` takes `effectiveDate` as an **argument** and never reads a clock. Production
supplies today; a rehearsal supplies the replay date. A pass that read the clock itself could
not be replayed and could not be tested for the day-boundary behaviour that produces movement
at all.

A scheduled invocation posts nothing and gets production draws as of today. **The cron
depends on that default** — do not add a body to the scheduled call.

### How active draws are selected

`settleAll` with no arguments selects production (non-replay) draws that are published or
later and not yet complete. **Replay draws are excluded from a default pass**, which is the
isolation migration 0022 exists to provide: a rehearsal cannot move real ratings, enforced by
trigger rather than by the caller remembering.

### Idempotence

Guaranteed at three levels, which is why re-running is always safe:

1. `apply_grades` only touches rows where `graded = false`.
2. `platform_events` dedupes on a content-derived key, so a re-sent result is not a second
   result.
3. `replace_draw_entry` and the snapshot writes are idempotent — a re-sent withdrawal returns
   `picks_voided = 0` and does not move `ceiling_at_lock`, asserted in
   `packages/settlement/src/disruption.test.ts`.

**You can always re-run settlement.** There is no state in which re-running makes things
worse, and that is the single most useful operational fact in this document.

---

## 2. Confirm `pg_cron` before you touch anything

ADR-0018 lists this as an open item and everything below depends on it.

```sql
select * from pg_available_extensions where name in ('pg_cron', 'pg_net');
create extension if not exists pg_cron;
create extension if not exists pg_net;   -- needed to call an Edge Function over HTTP
```

**If `pg_cron` is unavailable on the plan, stop.** ADR-0018's fallback is that Tier 2
collapses into a scheduler loop in the Railway container — "worse but workable" — and that is
a different day's work, not a variation on this one.

`pg_net` matters as much as `pg_cron`: cron runs SQL, and calling an Edge Function needs an
HTTP client inside the database.

---

## 3. The schedule

Store the service-role key in Vault rather than inlining it in a cron command — a cron
definition is readable by anyone who can read `cron.job`.

```sql
select vault.create_secret('<service-role-key>', 'service_role_key');
```

### The four jobs

```sql
-- 1. lock-draws — every minute
-- Bookkeeping only since migration 0013: the lock is enforced by clock in RLS, so a missing
-- sweep no longer lets anyone edit after first ball. It controls how quickly locked brackets
-- become publicly readable.
select cron.schedule('lock-draws', '* * * * *', $$
  select lock_draw(id) from draws
  where status = 'published' and now() >= locks_at
$$);

-- 2. reconcile-results — every 5 minutes
-- THE SAFETY NET. This is what makes a single listener acceptable, and what substitutes for
-- the listener entirely if you defer building it. A socket gap becomes a five-minute delay
-- rather than a lost result.
select cron.schedule('reconcile-results', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<ref>.functions.supabase.co/ingest-events',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'service_role_key'),
      'Content-Type', 'application/json'),
    body := jsonb_build_object('mode', 'reconcile')
  )
$$);

-- 3. settle-tournament — every 15 minutes
-- No body. The default is production draws as of today; see §1.
select cron.schedule('settle-tournament', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://<ref>.functions.supabase.co/settle-tournament',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'service_role_key'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb
  )
$$);

-- 4. refresh-projections — every minute
-- Documented as a comment in migration 0002 since the beginning.
select cron.schedule('refresh-projections', '* * * * *', $$
  refresh materialized view concurrently leaderboard
$$);
```

### Cadence, and why these numbers

| Job | Cadence | Reasoning |
|---|---|---|
| `lock-draws` | `* * * * *` | Cheap. Only affects read visibility |
| `reconcile-results` | `*/5 * * * *` | **A guess informed by nothing** — ADR-0018 says so in as many words, and asks that it be set by provider quota instead. The M3.5 Geneva capture has the data. Measure before you trust five minutes |
| `settle-tournament` | `*/15 * * * *` | Settlement is ~10 minutes of CPU per **million** brackets, single-threaded and measured (`settlement-scale.test.ts`). At beta scale a pass is milliseconds; 15 minutes is generous and keeps the Daily Check's day boundary comfortably fresh |
| `refresh-projections` | `* * * * *` | `concurrently`, so it does not block reads |

**Do not schedule `settle-slate`.** It is triggered per match by the ingest pipeline and
carries its own 5-minute sweep. A cron on top of that is a third path to the same rows.

### Confirm they are armed

```sql
select jobid, jobname, schedule, active from cron.job order by jobname;
select jobname, status, start_time, end_time
from cron.job_run_details order by start_time desc limit 20;
```

`cron.job_run_details` records that cron *fired*. It says nothing about whether settlement
*worked* — that is `settlement_runs` and §5.

---

## 4. Verification — the seven steps

Do this once on a replay draw before opening the beta, and once on the first real tournament.
**In order.** Each step's output is the next step's input, and a failure at step 4 means
something different from a failure at step 6.

### 1. A completed match is ingested

```sql
select id, status, winner_side, updated_at from matches
where draw_id = '<draw>' and status = 'completed' order by updated_at desc limit 5;
```

**Fails →** `docs/runbooks/02-feed-outage.md`, or the provider. Nothing below can work.

### 2. Settlement runs

```sql
select id, kind, started_at, finished_at, status, draws_processed, brackets_scored
from settlement_runs order by started_at desc limit 5;
```

Expect a row within the last 15 minutes with `status = 'succeeded'`.

**No row →** cron is not firing (`cron.job_run_details`) or the function is 500ing. **If the
function 500s on module resolution, that is the STOP section at the top of this runbook.**

### 3. Bracket scores change

```sql
select id, score, ceiling, alive_count, champion_alive
from brackets where draw_id = '<draw>' order by score desc limit 10;
```

`score` must be non-zero for at least one bracket whose picks match a completed result.

**Scores all zero with graded predictions →** the bug is in `packages/settlement`. Reproduce
locally with the integration suite; do not debug in production.

### 4. Snapshots are written

```sql
select bracket_id, as_of, score, ceiling, alive_count, champion_alive
from bracket_snapshots where as_of >= current_date - 1 order by as_of desc limit 10;
```

**One row per bracket per day.** This is the grain the entire Daily Check depends on — you
cannot say what happened *today* without knowing what was true *yesterday*.

**Missing →** movement will be null and the Daily Check quiet, even though scores are
correct. **This is the most likely silent failure in the whole chain**, because everything
else looks right.

### 5. League standings change

```sql
select member_id, score, previous_score, score_delta, position, previous_position,
       position_delta, champion_alive
from league_tournament_standings where league_tournament_id = '<lt>' order by position;
```

`previous_score` non-null and `score_delta` populated for anyone who moved.

**`previous_score` null on every row →** step 4 has not run for two consecutive days yet.
Wait a day. It is not a bug on day one.

> **A rehearsal caveat that will confuse you.** Movement is anchored to `current_date`
> (migration 0018), so **a replay of a historical fortnight cannot produce
> historically-dated movement.** Play rehearsals against recent calendar days. This is
> recorded in `KNOWN_WEAKNESSES.md` §4 rather than fixed, because the alternative — making
> the movement view take a date parameter — would put a settable clock on the one surface
> members read.

### 6. Daily Check movement becomes available

Open `/leagues/{slug}` as a member with a locked bracket. The headline should report movement
— *"Up 2 places overnight"* — rather than an anticipation beat.

```sql
select member_id, event_id, local_day, lead_beat_key, check_kind
from daily_check_log order by local_day desc limit 10;
```

**Beats present but no movement language →** step 5. The check is honest: it will not invent
movement it cannot see.

### 7. The Founder Dashboard reports healthy settlement

`/founder` → the **Settlement** group. All four green:

| Tile | Healthy |
|---|---|
| Runs | non-zero, `0 failed` |
| Stalled | `0` |
| **Unfrozen leagues** | **`0`** |
| Season rows written | non-zero after an event completes |

**`Unfrozen leagues` is the tile that matters.** Its absence is what let league settlement
stay disconnected for two entire phases. A non-zero value means a finished event was never
frozen into its league, and members are looking at standings that will change.

---

## 5. Health, alerting and thresholds

| Signal | Source | Healthy | Alert |
|---|---|---|---|
| Last successful run | `settlement_runs` | < 30 min during play | **S1** at 60 min |
| Failed runs | `settlement_runs.status` | 0 | **S1** at ≥ 1 |
| Stalled runs | running > 1 hour | 0 | **S1** at ≥ 1 |
| Unfrozen leagues | `founder_dashboard()` | 0 | **S1** at ≥ 1 |
| Snapshot freshness | `bracket_snapshots.as_of` | today | **S2** if yesterday is the newest |
| Partial runs | `settlement_runs` | 0 | **S2** — `watch`, not `bad` |
| Provider freshness | `provider_freshness` | < 10 min during play | **S2** at 30 min |

Thresholds are asserted once, in `apps/web/server/repositories/founder.ts`, so the dashboard
has no opinions of its own and every judgement about what counts as unhealthy is reviewable
in one place. **Change them there, not here.**

### Distinguishing the states

- **Healthy** — recent successful run, no failures, zero unfrozen.
- **Stale** — last run older than cadence, no failures. Cron stopped. Scores are correct and
  old. **S2.**
- **Partial** — a run touched some draws and not others. Re-run; it is idempotent. **S2.**
- **Degraded** — settling but provider data is stale. Settlement is fine; ingestion is not.
  **S2**, and the runbook is `02-feed-outage.md`.
- **Failed** — a run errored, or unfrozen leagues > 0. **S1.**

**Stale is an S2 and false is an S1, and the gap between them is the whole operating
philosophy.** A blank screen is recoverable. A confidently wrong score is not.

---

## 6. Manual rerun

```bash
curl -X POST 'https://<ref>.functions.supabase.co/settle-tournament' \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' -d '{}'
```

For a specific date — a missed day, or a rehearsal:

```bash
curl -X POST '.../settle-tournament' \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"effectiveDate": "2026-06-04"}'
```

Safe, unconditionally, because of the three idempotence guarantees in §1. **This is the
answer to most settlement incidents** — see `docs/runbooks/04-settlement-failure.md` for the
full procedure.

**Replay isolation.** A default pass excludes replay draws. To settle a rehearsal you must
name it explicitly, and migration 0022's trigger prevents permanent rating movement
regardless. A reset cannot be pointed at a real tournament. **Do not disable that isolation
to make a rehearsal easier.**

---

## 7. Failure modes

### Settlement is late

Scores are correct and old. Members see a stale scoreboard with no indication — except that
`SettlementDisclosure` renders per-state copy on the tournament page, sourced from
`draw_settlement_health` (migration 0012), so the interface reports what the database knows
rather than guessing from a timestamp.

**Do:** check `cron.job_run_details`, re-run manually, then find out why cron stopped.
**Do not:** hand-write scores.

### Settlement fails halfway

`settlement_runs` accounting exists precisely so a resumable job knows what it already did.
Re-run. The pass will skip what is done.

**If a run is `running` and has been for over an hour it is stalled, not working.** Mark it
failed and re-run:

```sql
update settlement_runs set status = 'failed', finished_at = now()
where id = '<run>' and status = 'running' and started_at < now() - interval '1 hour';
```

### Settlement produces a wrong score

**S1 — this is the one that is genuinely dangerous**, because members act on it and share it.

1. Do not re-run. A re-run will reproduce it.
2. Reproduce locally: `pnpm --filter @matchread/settlement test` against a migrated database.
3. Fix in `packages/settlement`, with a test that fails first.
4. Event tables are append-only, so a corrected pass can be replayed over history — that is a
   design property (ADR-0012), **not a runbook.** Write the replay procedure when you first
   need it; `06-replay-procedure.md` is the closest thing that exists.

### Nothing has settled and everything looks fine

The failure this whole runbook exists for. Check in this order:

1. `cron.job` — is the job even there? `active = true`?
2. `cron.job_run_details` — is it firing?
3. Supabase → Functions → Logs — is the invocation arriving?
4. **Is it 500ing on module resolution?** → the STOP section.
5. `settlement_runs` — is it starting and not finishing?

---

## 8. Arming checklist

- [ ] Module resolution resolved (A, B or C), and the choice written down
- [ ] `pg_cron` and `pg_net` confirmed available and created
- [ ] Service-role key in Vault, not inline in a cron command
- [ ] Four jobs scheduled; `select * from cron.job` shows all four `active`
- [ ] `cron.job_run_details` shows successful runs
- [ ] Seven-step verification passed on a **replay** draw
- [ ] Seven-step verification passed on the **first real** tournament
- [ ] `reconcile-results` cadence set against measured provider quota, not left at the guess
- [ ] Alert on `reconcile-results` staleness — ADR-0018 asks for this explicitly, because
      without the sweep the single listener silently becomes a single point of failure for
      *correctness* rather than only for *latency*
- [ ] `Unfrozen leagues` reads 0 on `/founder`
