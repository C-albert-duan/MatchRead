# Phase 8 checklist — Public window

Dev: **http://localhost:3001**

## Live poll (REST)

- [ ] Tournament page with published draw: standings refresh without full navigation (~45s)
- [ ] Season standings with rows: same gentle refresh
- [ ] No refresh when draw pending (tournament) / empty season table
- [ ] Tab backgrounded: browser may throttle timers — acceptable for MVP

## Settlement dry-run

- [ ] `node scripts/verify-settlement-math.mjs` exits 0
- [ ] Commissioner settlement on fixture updates event + season tables
- [ ] Re-run settlement updates Δ (regression from Phase 4)

## Bracket 128 perf

- [ ] Fixture or slam draw_size 128 loads bracket without crash
- [ ] Horizontal scroll reaches Final on narrow viewports
- [ ] Pick / save still works on early rounds (smoke)
- [ ] Optional later: row virtualization if scroll/paint feels heavy on low-end phones

## Showcase

- [ ] `/showcase` still loads (stub OK) — full 128 gallery not required for this phase

## Pass (local/dev)

Math script green + poll wired + docs linked → Phase 8 **code ready**. Leave production auth / Vercel / Railway socket unchecked on [LAUNCH-CHECKLIST](../LAUNCH-CHECKLIST.md).

Update [STATUS.md](../STATUS.md) when owner confirms the boxes above.
