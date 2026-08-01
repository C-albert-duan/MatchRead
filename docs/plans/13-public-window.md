# Plan 13 — Public US Open window

**Status: CODE ASSIST SHIPPED (2026-07-31)** — owner arms cron/domain; Railway socket still later.

**Walkthrough:** [13-public-window-checklist.md](./13-public-window-checklist.md)

## Goal

Standings move without manual heroics during the live slam; browser stays current; 128-draw usable on devices.

## Done when

- [x] Manual + machine **ingest** paths documented and UI for recording results
- [x] Founder **settle all leagues** for a tournament
- [x] REST **LiveRefresh** poll (Phase 8)
- [x] Settlement math dry-run + 128 showcase smoke
- [ ] Production settlement **schedule** armed after dry run
- [ ] Real domain Auth + `NEXT_PUBLIC_SITE_URL`
- [ ] Railway socket **or** explicit accept of poll+ingest for launch

## Work shipped

1. `OfficialResultsPanel` on tournament page (commissioner/founder)
2. `recordOfficialResult` / `settleAllLeaguesForTournament` server actions
3. `supabase/functions/ingest-events` Edge Function
4. [INGEST.md](../runbooks/INGEST.md); SETTLEMENT / LIVE-LISTENER cross-links

## Arming cron (owner)

Until Railway/pg_cron is live, beta uses **Save result → Settle**. For public:

1. Dry-run fixture settle + math script green
2. Deploy `ingest-events`; set `INGEST_SECRET`
3. Schedule settlement only via Supabase/Railway (service role **not** on Vercel) — see [SETTLEMENT-SCHEDULING.md](../runbooks/SETTLEMENT-SCHEDULING.md)
4. Point Auth + `NEXT_PUBLIC_SITE_URL` at canonical domain

## Out of scope here

CEO Tier 2–3 → [Phase 14](./14-ceo-tier2-tier3.md)
