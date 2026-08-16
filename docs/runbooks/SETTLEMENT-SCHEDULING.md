# Runbook — Settlement scheduling

Until settlement runs, standings and Daily Check do not move.

## Current

| Trigger | Who | Where |
|---|---|---|
| **Finished match ingest** | Platform | After `sync-tennis` / worker reconcile upserts results for that tournament |
| **`settle-leagues` + pg_cron** | Platform | Every 5 min at minute 2, 7, … — only tournaments with **due** finished matches (timed `scheduled_at` reached, or no timed schedule) whose results are newer than the last snapshot |
| **Run settlement** | Commissioner | Tournament page (this league) |
| **Settle all leagues** | Founder | Tournament page after official results |
| Fixture seed | Dev | `0004_settlement.sql` for `uso-2026` |

Deploy: `npx supabase functions deploy settle-leagues --no-verify-jwt` then `npx supabase db push`. Uses Vault `project_url` + `ingest_secret` (same as sync-tennis). `sync-tennis` also POSTs settle after reconcile.

Flow:

1. Official winners in `match_results` ([INGEST.md](./INGEST.md) — UI, Edge, or seed)
2. `settleLeagueTournament` grades submitted brackets (`@matchread/core` `gradeBracket`)
3. Writes `bracket_snapshots` + recomputes `season_standings`
4. UI: event + season tables; Daily Check reads deltas

Settlement is **per tournament id**. Concurrent ATP + WTA draws in the same calendar week (e.g. Montreal + Toronto) are two tournament rows — settle each separately. Season standings sum snapshots across every tournament in the league, so both draws contribute when the league format is season.

Void / withdrawal: `pick_voids` + voided results — do not score as misses.

## Intent (production)

Periodic job that:

1. Reads new official match results (ingest)
2. Grades locked/submitted brackets
3. Writes snapshots / standings
4. Feeds Daily Check

## Options

| Option | Pros | Cons |
|---|---|---|
| Manual commissioner / founder | Safest for beta — **armed now** | Not scalable |
| Supabase Edge + `pg_cron` | Co-located; service role OK on Edge | Must dry-run first |
| Railway worker after ingest | Natural with socket listener | Extra service |
| Vercel Cron + service role | Convenient | **Forbidden** — no service-role on Vercel |

## Verification before arming cron

1. Save/ingest at least one official result.
2. Run settlement; assert scores and Δ.
3. Daily Check shows movement when Δ exists.
4. Math: `docker compose --env-file .env.docker --profile verify run --rm verify-math`
5. Only then schedule recurring settle (Edge/Railway — not Vercel service-role).

Live browser refresh: [LIVE-LISTENER.md](./LIVE-LISTENER.md).

## Do not

- Arm production cron before a dry run on a known fixture.
- Compute grades only in the client.
- Put `SUPABASE_SERVICE_ROLE_KEY` on Vercel.
