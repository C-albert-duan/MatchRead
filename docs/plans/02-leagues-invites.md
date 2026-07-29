# Plan 02 — Leagues + Invites

## Goal

Growth loop: create league → share link → friend joins → appears on league home.

## Status: **DONE** (2026-07-29)

## Done when

- [x] `/leagues`, `/leagues/new`, `/leagues/[slug]`, `/join/[token]`
- [x] Invite token copy works (client clipboard + manual fallback)
- [x] Join works signed-out (redirect through sign-in with `next`)
- [x] RLS: members only see own leagues (migration `0002_leagues.sql`)
- [x] Migration applied on Supabase project (SQL Editor)
- [x] Owner E2E: create → copy link → second account joins

## Schema

`leagues`, `league_members`, `league_invites` + `get_invite_preview` / `join_league_with_token` RPCs.

## Work

1. [x] Migrations + RLS (+ grants + `create_league` in one `0002` file)
2. [x] Server Actions for create / join / revoke-invite
3. [x] Empty states for no leagues
4. [x] Invite panel open after create (`?invite=1`)

## Apply

See [SUPABASE-SETUP.md](../SUPABASE-SETUP.md) — run `0002_leagues.sql` in the SQL Editor.

## Test checklist

[02-leagues-invites-checklist.md](./02-leagues-invites-checklist.md)

## References

Wireframe: My leagues, Start a league, Invite friends, Join a league
