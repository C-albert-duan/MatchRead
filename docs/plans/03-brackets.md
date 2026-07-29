# Plan 03 — Brackets

## Goal

Signature screen: fill a tournament tree, save, submit before lock.

## Done when

- [ ] `/leagues/[slug]/t/[ref]/bracket` editable before lock
- [ ] Distinct empty states: bye · unpicked · em dash
- [ ] Submit → locked UI when lock instant passes (or admin lock)
- [ ] Draw pending state on tournament/league when no draw yet

## Work

1. Fixture draw (128 or smaller for early UX) with fictional players
2. `BracketGrid` radiogroup component
3. Persist picks; no client-trusted lock
4. Offline / save-failed states from interaction spec

## References

Wireframe: Bracket — entry / locked · DESIGN-LANGUAGE PlayerChip + BracketGrid
