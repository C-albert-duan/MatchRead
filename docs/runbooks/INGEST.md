# Runbook — Results ingest

How official match winners enter `match_results` before settlement.

## Paths (pick one per environment)

| Path | When | How |
|---|---|---|
| **A. Commissioner UI** | Private beta / fixtures | Tournament page → **Official results** → Save result → **Run settlement** |
| **B. Founder settle-all** | Many leagues, same tournament | After results exist → **Settle all leagues** (founder) |
| **C. Edge `ingest-events`** | Machine / provider / Railway | `POST` JSON with `INGEST_SECRET` (below) |
| **D. SQL seed** | Dev only | `0004_settlement.sql` fixture winners for `uso-2026` |

Settlement is **always** a separate step (grades brackets → snapshots). Ingest alone does not move standings.

## RapidAPI reconcile (Plan 16)

Worker/script holds `RAPIDAPI_*` → maps → `POST` ingest. See [RECONCILE-RESULTS.md](./RECONCILE-RESULTS.md).

```bash
npm run reconcile:results -- --dry-run --map .provider-map.json
```

## A/B — In-app (no service role)

1. Open `/leagues/[slug]/t/[ref]` as commissioner (or founder).
2. Enter `match_key` (e.g. `r0-m0`) and `winner_ref` (seat `player_ref`).
3. **Save result**.
4. Commissioner: **Run settlement** for this league.  
   Founder: **Settle all leagues** for the tournament.

## C — Edge Function

```bash
# Deploy once (Supabase CLI logged in)
supabase functions deploy ingest-events
supabase secrets set INGEST_SECRET=<long-random>
```

```http
POST https://<project-ref>.supabase.co/functions/v1/ingest-events
Authorization: Bearer <INGEST_SECRET>
Content-Type: application/json

{
  "tournament_id": "<uuid>",
  "results": [
    { "match_key": "r0-m0", "winner_ref": "p001", "voided": false }
  ]
}
```

Then settle (UI or future Railway cron that invokes settle logic — **not** Vercel with service-role).

## Railway socket (public window)

Worker holds provider socket → `POST`s to `ingest-events` → founder/cron settles. See [RAILWAY-WORKER.md](./RAILWAY-WORKER.md) + [LIVE-LISTENER.md](./LIVE-LISTENER.md).

## Do not

- Put `SUPABASE_SERVICE_ROLE_KEY` or `INGEST_SECRET` in the Next.js / Vercel web env.
- Skip settlement after ingest and expect Daily Check to move.
