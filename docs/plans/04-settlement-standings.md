# Plan 04 — Settlement + Standings

## Goal

Official results grade brackets; event and season tables move.

## Status: **DONE** (2026-07-29)

## Done when

- [x] `packages/core` grading matches documented scoring (128 → max 512)
- [x] Settlement job can run (manual commissioner invoke; cron documented)
- [x] Standings show scores and rank deltas after a pass
- [x] Void / withdrawal path stubbed (`pick_voids` + voided match results)
- [x] Migration applied + owner E2E checklist

## Work

1. [x] Domain: `gradeBracket` / `seasonPoints` / `rankRows`
2. [x] Settlement runner writing `bracket_snapshots` + `season_standings`
3. [x] `/leagues/[slug]/season` + event standings on tournament page
4. [x] Document schedule in SETTLEMENT-SCHEDULING runbook

## Apply

Run `supabase/migrations/0004_settlement.sql` after 0003.

## Test checklist

[archive/04-settlement-standings-checklist.md](./archive/04-settlement-standings-checklist.md)

## Risk

Without this phase, Daily Check and CEO movement features are dishonestly quiet.
