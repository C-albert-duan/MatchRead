# Phase 6 test checklist — CEO Tier 1 Engagement

Dev: **http://localhost:3001**

## Prerequisites

- [ ] `0006_engagement.sql` applied (adds `brackets.confidence` + updated `save_bracket_picks`)
- [ ] Phase 4 settlement has produced a snapshot for your US Open league

## Confidence

- [ ] After picking a winner, 1–5 confidence buttons appear on the match
- [ ] Changing confidence debounces and saves with picks (status shows Saved)
- [ ] Re-picking a match clears downstream confidence entries
- [ ] Locked bracket: confidence visible but not editable
- [ ] `brackets.picks` still `{ matchKey: playerRef }` — confidence is a separate column

## League home

- [ ] After settlement: Bracket Health label for you (Elite / Surviving / Hanging On / In Trouble)
- [ ] Perfect picks remaining + league perfect count when snapshots exist
- [ ] League Highlights strip (Biggest Climber / Collapse / Upset King / Cold Streak) when data supports it
- [ ] Daily Check beats include health and/or biggest miss when available

## Standings

- [ ] Event standings Move column shows chips `+2` / `−1` / `—` from `position_delta`

## Pass

All boxes → Phase 6 done. Update [STATUS.md](../STATUS.md).
