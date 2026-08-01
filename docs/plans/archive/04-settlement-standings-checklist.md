# Phase 4 test checklist — Settlement + Standings

**Status: complete** (owner confirmed 2026-07-29). Kept for regression re-runs.

Dev: **http://localhost:3001**

## Prerequisites

- [x] `0004_settlement.sql` applied (seeds official `uso-2026` results)
- [x] Submitted bracket in a US Open 2026 league
- [x] Signed in as commissioner

## Settlement

- [x] Tournament page shows **Event standings** (empty before first run)
- [x] **Run settlement** grades submitted brackets
- [x] Your row appears with score / rank
- [x] Re-run updates Δ when scores change

## Season

- [x] `/leagues/[slug]/season` shows scaled points after settlement

## Void stub

- [x] `pick_voids` table exists (operator path for Phase 7); match_results can be `voided`

## Pass

All boxes → Phase 4 done. Update [STATUS.md](../STATUS.md).
