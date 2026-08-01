# Phase 7 test checklist — Ops · i18n · Polish

Dev: **http://localhost:3001**

## Prerequisites

- [ ] Signed in locally
- [ ] Optional: set `FOUNDER_EMAILS=you@example.com` in `.env.docker` (comma-separated), then recreate the web container. If unset, any signed-in user sees a beta banner on founder routes.

## Founder health

- [ ] `/founder` redirects to sign-in when signed out
- [ ] Signed-in founder (or beta open gate) sees counts: leagues, members, submitted brackets, snapshots, match results, last `ranked_at`
- [ ] Note about no service-role in browser is visible
- [ ] Link to disruption tool works
- [ ] Wrong email when `FOUNDER_EMAILS` is set → denied message

## Disruption / void

- [ ] `/founder/disruption` form: tournament, player_ref, from_round, reason
- [ ] Preview copy: members lose a pick (void), not a miss
- [ ] Submit records `pick_voids` (commissioner RLS required for that tournament)
- [ ] Future undecided / player-path `match_results` marked `voided` when RLS allows
- [ ] After success → prompt to re-run settlement
- [ ] Re-run settlement on a league → voided picks do not score as misses

## i18n

- [ ] Landing + nav labels change with footer locale switcher (en | es | ja)
- [ ] Cookie `mr_locale` persists across refresh
- [ ] es / ja are real translations (not English copies) for landing / nav / founder / offline

## Offline / error

- [ ] DevTools → Offline → banner “You are offline…” (or locale equivalent)
- [ ] Founder pages show `ErrorNote` on denied / load failure

## Pass

All boxes → Phase 7 code done. Update [STATUS.md](../STATUS.md).
