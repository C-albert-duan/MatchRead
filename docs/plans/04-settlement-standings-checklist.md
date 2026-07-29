# Phase 4 test checklist — Settlement + Standings

Dev: **http://localhost:3001**

## Prerequisites

- [ ] `0004_settlement.sql` applied (seeds official `uso-2026` results)
- [ ] Submitted bracket in a US Open 2026 league
- [ ] Signed in as commissioner

## Settlement

- [ ] Tournament page shows **Event standings** (empty before first run)
- [ ] **Run settlement** grades submitted brackets
- [ ] Your row appears with score / rank
- [ ] Re-run updates Δ when scores change

## Season

- [ ] `/leagues/[slug]/season` shows scaled points after settlement

## Void stub

- [ ] `pick_voids` table exists (operator path for Phase 7); match_results can be `voided`

## Pass

All boxes → Phase 4 done. Update [STATUS.md](../STATUS.md).
