# Runbook — RapidAPI reconcile → ingest

Plan: [16-rapidapi-reconcile.md](../plans/16-rapidapi-reconcile.md)  
**Full walkthrough:** [SCENARIO-RAPIDAPI-RESULTS.md](./SCENARIO-RAPIDAPI-RESULTS.md)

Bring finished ATP/WTA matches into `match_results` without putting `RAPIDAPI_*` on Vercel.

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

Workflow: [`.github/workflows/reconcile-results.yml`](../../.github/workflows/reconcile-results.yml)

Runs every **6 hours** (UTC) plus manual **Run workflow**. Secrets stay in GitHub — **not** on Vercel.

### Repo secrets

GitHub → repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `RAPIDAPI_KEY` | RapidAPI key |
| `RAPIDAPI_HOST` | Optional; defaults to `tennis-api-atp-wta-itf.p.rapidapi.com` |
| `MATCHREAD_INGEST_URL` | `https://opugihofwvunwkpcmboq.supabase.co/functions/v1/ingest-events` |
| `INGEST_SECRET` | Same as Supabase function secret |
| `PROVIDER_MAP_JSON` | Full JSON of your `.provider-map.json` |

### First run

1. Merge/push workflow to default branch (`main`).
2. **Actions → Reconcile RapidAPI results → Run workflow** with **dry_run = true**.
3. Confirm logs show mapped rows.
4. Run again with **dry_run = false** (live ingest).
5. On the website: **Settle** (still manual for v1).

Scheduled runs always do **live** ingest (not dry-run). Tighten cron only after upgrading off Basic.

### Edge Function JWT

`ingest-events` must be deployed with **`--no-verify-jwt`** because auth is the custom `INGEST_SECRET` bearer, not a Supabase JWT:

```bash
npx supabase functions deploy ingest-events --project-ref opugihofwvunwkpcmboq --use-api --no-verify-jwt
```

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
