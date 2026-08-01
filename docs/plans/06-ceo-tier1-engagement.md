# Plan 06 — CEO Tier 1 Engagement

**Status: CODE DONE** — apply `0006` + E2E via [completion Phase 10](./09-completion-to-launch.md#phase-10--owner-e2e-sign-off)

## Goal

Ship Must-Have engagement layer from FEATURE-PRIORITIES.md on top of a working loop.

## Done when

- [x] Pick Confidence on every bracket slot
- [x] Bracket Health label (Elite / Surviving / Hanging On / In Trouble)
- [x] Biggest Miss after settlement rounds
- [x] Perfect Picks Remaining (+ league perfect count)
- [x] Live leaderboard movement chips
- [x] League Highlights labels
- [x] Daily Recap content wired into Daily Check family

## Work

1. [x] Schema: `confidence jsonb` on `brackets`; `save_bracket_picks` accepts optional `p_confidence`
2. [x] Derive health / miss / perfect from graded brackets (`packages/core` `engagement.ts`)
3. [x] Highlight generator (deterministic rules; no AI)
4. [x] UI on league home + bracket editor + standings chips + Daily Check beats

## Out of scope here

Tier 2 (AI insights, upset alerts) and Tier 3 (share cards, DNA, trophies) unless Tier 1 finishes early.
