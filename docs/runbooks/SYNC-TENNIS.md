# Runbook — Automatic Tennis API sync

**Clock is Supabase only.** `pg_cron` every **5 minutes** POSTs `sync-tennis`. GitHub is not required.

```
pg_cron (every 5 min)
        │  Vault: project_url + ingest_secret
        ▼
sync-tennis  (RAPIDAPI_KEY in Supabase Edge secrets)
      ├── Tennis API Mega facts: draws, fixtures, results, live events
      ├── rebuild-draw
      └── ingest-events → settle-leagues
        ▼
Postgres → Vercel page
```

Odds and predictions from Mega are **not** stored. MatchRead only writes official seats, schedule, and results.

## 1. Edge secrets + deploy

## 1. Edge secrets + deploy

```bash
npx supabase secrets set RAPIDAPI_KEY=<rapidapi-key>
npx supabase secrets set INGEST_SECRET=<long-random>
npx supabase functions deploy ingest-events --no-verify-jwt
npx supabase functions deploy rebuild-draw --no-verify-jwt
npx supabase functions deploy sync-tennis --no-verify-jwt
npx supabase functions deploy settle-leagues --no-verify-jwt
npx supabase db push
```

`RAPIDAPI_KEY` never goes on Vercel, GitHub, or in SQL.

## 2. Vault (one-time, SQL editor)

Edge secrets are **not** visible to Postgres. Cron needs the same ingest token in Vault:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<same INGEST_SECRET as above>', 'ingest_secret');
```

Then the next 5-minute tick calls `public.invoke_sync_tennis()`.

Check:

```sql
select jobid, jobname, schedule, active from cron.job where jobname like 'sync-tennis%';
select public.invoke_sync_tennis(); -- fire once now
```

If Vault names are missing, the function returns `null` and does nothing.

## 3. Manual test (optional)

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/sync-tennis" \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"job":"all","dryRun":true,"ref":"cin-2026"}'
```

Then the same without `dryRun`.

## 4. RapidAPI quota

5 minutes = 288 runs/day. Each run is a few GETs **per live event** (draw, fixtures, results) plus one live-events call. Sync includes events whose `starts_on` is inside **21 days ago → 45 days ahead**.

Mega (3.8M/mo) can sustain this. RapidAPI **Basic (50 req/day)** cannot.

## 5. GitHub (optional)

[`.github/workflows/sync-tennis.yml`](../../.github/workflows/sync-tennis.yml) is **manual only** (`workflow_dispatch`). No schedule. Do not run it on a timer while pg_cron is active — you would double the quota.

## 6. Local (optional)

`apps/worker` from `.env.provider` on a laptop. Optional Mega live socket. Production REST clock is 5-minute `sync-tennis`.

Settlement runs automatically after each sync tick **when finished matches were ingested**, and again on the 5-minute settle cron for any due results still newer than the last snapshot.
