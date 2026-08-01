# Plan 03 — Brackets

## Goal

Signature screen: fill a tournament tree, save, submit before lock.

## Status: **DONE** (2026-07-29)

## Done when

- [x] `/leagues/[slug]/t/[ref]/bracket` editable before lock
- [x] Distinct empty states: bye · unpicked · em dash
- [x] Submit → locked UI when lock instant passes (or admin lock)
- [x] Draw pending state on tournament/league when no draw yet
- [x] Migration applied on Supabase + owner E2E checklist
- [x] Bracket column alignment (fixed slot height / centred feeders)

## Work

1. [x] Fixture draw (16 for early UX) with fictional players — `uso-2026`
2. [x] `BracketGrid` radiogroup + `PlayerChip`
3. [x] Persist picks via `save_bracket_picks` / `submit_bracket` (server lock)
4. [x] Offline / save-failed status copy from interaction spec

## Apply

Run `supabase/migrations/0003_brackets.sql` in the SQL Editor after 0001 + 0002.
See [SUPABASE-SETUP.md](../SUPABASE-SETUP.md).

## Test checklist

[archive/03-brackets-checklist.md](./archive/03-brackets-checklist.md)

## References

Wireframe: Bracket — entry / locked · DESIGN-LANGUAGE PlayerChip + BracketGrid
