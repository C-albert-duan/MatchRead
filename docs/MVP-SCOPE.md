# MVP Scope — US Open 2026 web

## In scope (Launch MVP)

| Area | Includes | Build status |
|---|---|---|
| Auth | Magic link email only; no separate account-creation screen | Code done — prod E2E open |
| Landing | Public argument + tournament calendar strip | Done |
| Leagues | Create (single \| season), invite link, join, home | Done (local E2E) |
| Brackets | Full tree entry, submit, lock, settled colour | Done (local E2E) |
| Standings | Event + season tables, movement | Done (local E2E) |
| Daily Check | Morning / live / evening computed pulse | Code done — E2E open |
| Between tournaments | Designed waiting state | Code done — E2E open |
| Result artifact | Shareable placement object | Code done — E2E open |
| Reference | `/tournaments`, `/players` (rankings — not user directory) | Done |
| Shell | Global nav, settings (locale + basic prefs), errors | Done |
| Ops | Founder dashboard + disruption console (minimum) | Code done — E2E open |
| i18n | English first; es/ja before public launch | Code done — E2E open |

## CEO Tier 1 (on top of the loop — see FEATURE-PRIORITIES)

Pick Confidence · Bracket Health · Biggest Miss · Perfect Picks Remaining · Live Leaderboard Movement · League Highlights · Daily Recap  

**Status:** code shipped — sign-off = [completion Phase 10](./plans/09-completion-to-launch.md#phase-10--owner-e2e-sign-off).

## Finish line

Remaining work (auth/SMTP, invite wave, public cron/ingest, optional Tier 2–3): [plans/09-completion-to-launch.md](./plans/09-completion-to-launch.md).

## Out of scope for web launch

| Item | Why |
|---|---|
| Daily picks / Today's Matches / Match Detail | Mobile product; Visual Exploration in wireframe only |
| User profile / Prediction history / Match IQ | Not on web |
| Push notifications | Daily Check is a pull habit by choice |
| AI Match Insights / Upset Alerts | CEO Tier 2 — after Tier 1 |
| Lightweight onboarding screen | Post-launch; email fallback for display name |
| Always-on live socket listener | Deferrable for invited beta; required for public launch |

## Success definition

A commissioner can create a league, share a link, friends join, everyone completes brackets, standings update, and members return — without the word "pick" needing a separate daily-slate product.
