# Runbook — RapidAPI reconcile → ingest

Plan: [16-rapidapi-reconcile.md](../plans/16-rapidapi-reconcile.md)  
**Full walkthrough:** [SCENARIO-RAPIDAPI-RESULTS.md](./SCENARIO-RAPIDAPI-RESULTS.md)

Bring finished ATP/WTA matches into `match_results` without putting `RAPIDAPI_*` on Vercel.

**Production:** [SYNC-TENNIS.md](./SYNC-TENNIS.md) — `RAPIDAPI_KEY` in Supabase secrets, Edge Function `sync-tennis`, GitHub Action only wakes it. This page is the local / mapping reference.

## Prerequisites

1. Basic (or higher) RapidAPI subscription; key in `.env.provider`
2. Migration `0010_provider_refs.sql` applied (provider columns + `provider_match_map`)
3. Edge Function `ingest-events` deployed + `INGEST_SECRET` (for live POST)
4. A mapping file (copy `.provider-map.example.json` → `.provider-map.json`)

## Mapping file

```json
{
  "tournament_id": "<MatchRead tournaments.id uuid>",
  "provider_tournament_id": "21346",
  "tour": "atp",
  "players": { "<rapidapiPlayerId>": "<player_ref>" },
  "matches": { "<rapidapiMatchId>": "r0-m0" }
}
```

Unmapped matches are **skipped** (fail closed). Fill `matches` from `/tennis/v2/{tour}/tournament/results/{id}` (`id` + `match_winner`).

## Commands

```bash
# Unit tests (no network)
npm run test:provider

# Dry-run: fetch + map, print ingest payload
npm run reconcile:results -- --dry-run --map .provider-map.example.json

# Live ingest (needs MATCHREAD_INGEST_URL + INGEST_SECRET in .env.provider)
npm run reconcile:results -- --map .provider-map.json
```

Then in the app: **Run settlement** (commissioner) or founder settle-all. Reconcile does **not** settle.

## GitHub Action (scheduled)

Workflow: [`.github/workflows/sync-tennis.yml`](../../.github/workflows/sync-tennis.yml) — see [SYNC-TENNIS.md](./SYNC-TENNIS.md).

Runs every **6 hours** (UTC) plus manual **Run workflow**. GitHub does **not** hold `RAPIDAPI_KEY`.

### Repo secrets

GitHub → repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `INGEST_SECRET` | Same as Supabase `INGEST_SECRET` |

### First run

1. `npx supabase secrets set RAPIDAPI_KEY=... INGEST_SECRET=...`
2. Deploy `sync-tennis`, `rebuild-draw`, `ingest-events` with `--no-verify-jwt`.
3. Merge/push workflow to default branch (`main`).
4. **Actions → Sync tennis facts → Run workflow** with **dry_run = true**.
5. Run again with **dry_run = false** (live ingest).
6. On the website: **Settle** (still manual for v1).

Scheduled runs always do **live** ingest (not dry-run). Tighten cron only after upgrading off Basic.

## Provider endpoint used

`GET /tennis/v2/{atp|wta}/tournament/results/{provider_tournament_id}`

- `match_winner` → looked up in `players`
- `result_type` walkover/default without winner → `voided: true`
- Retirement with a winner → ingest winner (not void)

Fixtures endpoints only return **upcoming** matches — do not use them for winners.

## Quota

Basic = **50 requests/day**. Each reconcile run = 1 GET (+ optional retries). Do not cron aggressively on Basic.

## After ingest on Vercel

Open Production/Preview tournament page — Official results / bracket grades. Settle. Confirm Daily Check / standings. Vercel env must still have no `RAPIDAPI_*`.
