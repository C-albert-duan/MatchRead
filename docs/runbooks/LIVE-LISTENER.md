# Runbook — Live results listener

How MatchRead learns that official match results changed, and how the browser stays current.

## Status

| Path | Status |
|---|---|
| **REST poll (browser)** | **Armed for MVP** — `LiveRefresh` → `router.refresh()` ~45s |
| Provider REST sweep / ingest | Documented; pair with settlement |
| Railway websocket worker | **Later** — required for public launch low-latency live scores |

Invited beta: REST lag is acceptable. Public US Open window: prefer socket → ingest → settle; keep poll as client fallback.

## Browser (now)

`apps/web/components/LiveRefresh.tsx`:

- Client-only; calls Next.js `router.refresh()` on an interval (default **45 seconds**).
- Enabled on tournament pages when a draw is published, and on season standings when rows exist.
- Does **not** open websockets. Re-fetches server-rendered RSC data only.

Tune interval via the `intervalMs` prop if needed; do not drop below ~30s without a reason (battery / rate limits).

## Ingest + settlement (server)

1. Official results land in `match_results` (fixture seed, provider REST, or future socket ingest).
2. Settlement grades brackets ([SETTLEMENT-SCHEDULING.md](./SETTLEMENT-SCHEDULING.md)).
3. Polling clients pick up new `bracket_snapshots` / `season_standings` on the next refresh.

Dry-run math: `node scripts/verify-settlement-math.mjs`.

## Later — Railway worker

Always-on process holds the provider socket and `POST`s to ingest. See [RAILWAY-WORKER.md](./RAILWAY-WORKER.md).

When the worker is live:

1. Keep `LiveRefresh` as a soft fallback (tabs recover if a push is missed).
2. Optionally shorten the poll interval only if product needs it — prefer push for urgency.
3. Do not move socket credentials into the Next.js / browser layer.

## Do not

- Require websockets for MVP or invited beta.
- Poll faster than needed “just in case.”
- Compute live grades only in the client.
