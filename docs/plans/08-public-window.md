# Plan 08 — Public window readiness

## Goal

Live listener strategy, proven settlement, and 128-draw perf — ready for the public US Open window.

## Status: **CODE DONE** (poll + math 2026-07-29) — production auth / cron / socket = [completion Phases 11–13](./09-completion-to-launch.md)

## Done when (pragmatic)

- [x] Documented live results listener strategy + working **REST poll** fallback
- [x] Settlement proven path documented + dry-run verification script
- [x] Core supports drawSize 128; horizontal scroll OK; perf checklist written
- [ ] Production domain auth + Vercel (see [LAUNCH-CHECKLIST](../LAUNCH-CHECKLIST.md))
- [ ] Always-on socket worker (deferred — Railway later)

## Work

1. [x] `LiveRefresh` client poll → `router.refresh()` (~45s) on tournament / season when live-relevant
2. [x] Runbook [LIVE-LISTENER.md](../runbooks/LIVE-LISTENER.md) — REST now; Railway/websocket later
3. [x] `scripts/verify-settlement-math.mjs` + `packages/core` slam constants / perf notes
4. [x] Perf checklist: [archive/08-public-window-checklist.md](./archive/08-public-window-checklist.md)

## Live refresh (MVP)

| Surface | When enabled |
|---|---|
| `/leagues/[slug]/t/[ref]` | Draw published |
| `/leagues/[slug]/season` | Season rows exist |

No websockets required. Poll is gentle (default 45s).

## Settlement dry-run

1. Apply `0004_settlement.sql`; submit fixture bracket.
2. Commissioner **Run settlement** on the tournament page.
3. `node scripts/verify-settlement-math.mjs` — asserts 128 → max 512, 7 rounds.
4. See [SETTLEMENT-SCHEDULING.md](../runbooks/SETTLEMENT-SCHEDULING.md).

## Bracket perf (128)

- Core: `maxBracketScore(128) === 512`, `buildRoundStructure(128).length === 7`
- UI: `.bracket-region` already `overflow-x: auto` — horizontal scroll is the MVP path
- Virtualization optional later if mobile jank appears
- Showcase note: `/showcase` remains a design stub; 128 UX is exercised on fixture `/bracket`

## References

PRODUCT.md · [LAUNCH-CHECKLIST](../LAUNCH-CHECKLIST.md) · [RAILWAY-WORKER.md](../runbooks/RAILWAY-WORKER.md)
