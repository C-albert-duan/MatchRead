# Plan 04 — Settlement + Standings

## Goal

Official results grade brackets; event and season tables move.

## Done when

- [ ] `packages/core` grading matches documented scoring (128 → max 512)
- [ ] Settlement job can run (cron or manual edge invoke)
- [ ] Standings show scores and rank deltas after a pass
- [ ] Void / withdrawal path stubbed for operator later

## Work

1. Domain: `gradePrediction` / bracket grade API
2. Settlement runner writing snapshots
3. `/leagues/[slug]/season` + event standings on tournament page
4. Document schedule in SETTLEMENT-SCHEDULING runbook and arm it

## Risk

Without this phase, Daily Check and CEO movement features are dishonestly quiet.
