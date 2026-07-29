# Plan 02 — Leagues + Invites

## Goal

Growth loop: create league → share link → friend joins → appears on league home.

## Done when

- [ ] `/leagues`, `/leagues/new`, `/leagues/[slug]`, `/join/[token]`
- [ ] Invite token copy works on mobile
- [ ] Join works signed-out (redirect through sign-in with `next`)
- [ ] RLS: members only see own leagues

## Schema (minimum)

`leagues`, `league_members`, `league_invites` + policies

## Work

1. Migrations + RLS
2. Server Actions for create / join / revoke-invite
3. Empty states for no leagues
4. Invite panel open after create

## References

Wireframe: My leagues, Start a league, Invite friends, Join a league
