# Runbook — Settlement scheduling

Until settlement runs, standings and Daily Check do not move.

## Intent

Periodic job that:

1. Reads new official match results (from projections / ingest)
2. Grades open locked brackets via `packages/core`
3. Writes snapshots / standings deltas
4. Updates inputs used by Daily Check

## Options (choose one for beta)

| Option | Pros | Cons |
|---|---|---|
| Supabase `pg_cron` + SQL/edge invoke | Co-located with DB | Must arm carefully; test first |
| Scheduled Edge Function / external cron | Easy to observe | Needs secrets |
| Manual founder trigger | Safest for first week | Not scalable |

## Verification

1. Seed a locked bracket + known match winners.
2. Run settlement once.
3. Assert scores and rank deltas change.
4. Assert Daily Check is no longer permanently "quiet" when movement exists.
5. Only then schedule recurring runs.

## Do not

- Arm production cron before a dry run on a known fixture.
- Compute grades only in the client.
