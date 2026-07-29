# Phase 5 test checklist — Daily Check

Dev: **http://localhost:3001**

## Prerequisites

- [ ] `0005_daily_check.sql` applied (optional cache; pulse still works without it)
- [ ] Phase 4 settlement has produced a snapshot for your US Open league

## League home

- [ ] Daily Check is the first content block under the title
- [ ] Draw-pending league (e.g. Wimbledon) → "Your league is ready"
- [ ] After submit, before lock / others missing → awaiting entries copy
- [ ] After settlement with movement → headline uses the same Δ as the standings table
- [ ] Quiet (no Δ) → "A quiet day in your league"
- [ ] CTA opens bracket / invite / result as labelled

## Result artifact

- [ ] `/leagues/[slug]/t/uso-2026/result` shows place, score, % of perfect, champion
- [ ] Link from tournament page **See my result** works after settlement

## Pass

All boxes → Phase 5 done. Update [STATUS.md](../STATUS.md).
