# Plan 05 — Daily Check

## Goal

League home answers "what happened in my league today" with a computed pulse, not a stats dashboard.

## Status: **CODE DONE** (2026-07-29) — owner E2E = completion Phase 10

## Done when

- [x] League home leads with Daily Check (morning / live / evening / quiet family)
- [x] Numbers agree with standings table (deltas only from snapshots)
- [x] Between-tournaments modules when nothing is in play (`draw_pending`)
- [x] Result artifact route for finished event placement
- [ ] Migration applied + owner E2E checklist → [09-completion-to-launch Phase 10](./09-completion-to-launch.md#phase-10--owner-e2e-sign-off)

## Work

1. [x] `packages/core` `computeDailyCheck` from standings + results
2. [x] Persist/cache in `daily_check_log`
3. [x] Core state family: draw_pending · awaiting · no_data · live · quiet · champion_out · void · final

## Apply

Run `supabase/migrations/0005_daily_check.sql` after 0004.

## Test checklist

[archive/05-daily-check-checklist.md](./archive/05-daily-check-checklist.md) · active: [10-owner-e2e-checklist.md](./10-owner-e2e-checklist.md)

## References

PRODUCT.md · FEATURE-PRIORITIES Daily Recap · wireframe League home
