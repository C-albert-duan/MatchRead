# Plan 05 — Daily Check

## Goal

League home answers "what happened in my league today" with a computed pulse, not a stats dashboard.

## Done when

- [ ] League home leads with Daily Check (morning / live / evening / quiet)
- [ ] Numbers agree with standings table (no contradictory deltas)
- [ ] Between-tournaments modules when nothing is in play
- [ ] Result artifact route for finished event placement

## Work

1. `packages/core` pulse computation from standings + results
2. Persist or cache in `daily_check_log` as needed
3. States from wireframe inventory (13 league-home states — implement family incrementally)

## References

PRODUCT.md · FEATURE-PRIORITIES Daily Recap · wireframe League home
