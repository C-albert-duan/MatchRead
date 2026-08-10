# Plan 18 — Solo brackets

## Goal

Lowest-friction top of funnel: fill a bracket without joining a social league first. Upgrade by inviting friends into the same container before lock.

## Status: **IN PROGRESS**

## Decisions

- **Model:** Implicit private `single` league of one (`leagues.is_solo = true`). Reuses save / submit / lock / settle.
- **Upgrade:** Invite into that league (existing token flow). Second member clears `is_solo`.
- **Entry window:** Same tournament `lock_at` / `admin_locked_at`.
- **Post-lock UX:** Score-first surfaces while alone; standings when `member_count >= 2`.

Out of scope: attach/copy into a different league; one bracket scoring in many leagues; nullable `league_id`.

## Done when

- [ ] Migration `0013_solo_brackets.sql` applied on Supabase
- [ ] Calendar / landing / empty leagues → `/enter/[ref]` (or existing league) instead of forcing `/leagues/new`
- [ ] Solo list / home / tournament / result hide standings-of-one; invite upgrade CTA
- [ ] After submit while solo → invite offer on bracket
- [ ] Friend joins via invite → `is_solo` false → standings appear
- [ ] Owner E2E checklist below passes

## Schema

[`supabase/migrations/0013_solo_brackets.sql`](../../supabase/migrations/0013_solo_brackets.sql)

- `leagues.is_solo`
- Partial unique `(commissioner_id, tournament_label)` for solo singles
- RPC `ensure_solo_league(p_tournament_ref)`
- `join_league_with_token` clears `is_solo` when member count ≥ 2

## App

| Piece | Path |
|---|---|
| Enter route | `apps/web/app/enter/[ref]/page.tsx` |
| Action | `ensureSoloLeague` in `apps/web/app/actions/leagues.ts` |
| Helper | `apps/web/lib/leagues/solo.ts` |
| Funnel | landing, `/tournaments`, `/leagues` empty |

## Apply

Run `0013_solo_brackets.sql` in the SQL Editor after `0012`. See [SUPABASE-SETUP.md](../SUPABASE-SETUP.md).

## Test checklist

[18-solo-brackets-checklist.md](./18-solo-brackets-checklist.md)
