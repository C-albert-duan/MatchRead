# Runbook — Settlement scheduling

Until settlement runs, standings and Daily Check do not move.

## Current (Phase 4)

**Manual commissioner trigger** on the tournament page: **Run settlement**.

Flow:

1. Official winners live in `match_results` (fixture seeded by `0004_settlement.sql` for `uso-2026`)
2. `settleLeagueTournament` server action grades submitted brackets with `@matchread/core` `gradeBracket`
3. Writes `bracket_snapshots` (score, rank, deltas) and recomputes `season_standings`
4. UI: event table on `/leagues/[slug]/t/[ref]` · season on `/leagues/[slug]/season`

Void / withdrawal: `pick_voids` + `match_results.voided` stub for Phase 7 operator UI. Do not score voided picks as misses.

## Intent (production)

Periodic job that:

1. Reads new official match results (from projections / ingest)
2. Grades locked brackets via `packages/core`
3. Writes snapshots / standings deltas
4. Updates inputs used by Daily Check

## Options (choose one for beta)

| Option | Pros | Cons |
|---|---|---|
| Manual commissioner / founder trigger | Safest for first week — **armed now** | Not scalable |
| Supabase `pg_cron` + edge invoke | Co-located with DB | Must arm carefully; test first |
| Scheduled Edge Function / external cron | Easy to observe | Needs secrets |

## Verification

1. Apply `0004_settlement.sql`; submit a fixture bracket.
2. Run settlement once from the tournament page.
3. Assert scores and rank deltas change.
4. Assert Daily Check is no longer permanently "quiet" when movement exists (Phase 5).
5. Only then schedule recurring runs.

## Do not

- Arm production cron before a dry run on a known fixture.
- Compute grades only in the client.
