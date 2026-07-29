# MVP Scope — US Open 2026 web

## In scope (Launch MVP)

| Area | Includes |
|---|---|
| Auth | Magic link email only; no separate account-creation screen |
| Landing | Public argument + tournament calendar strip |
| Leagues | Create (single \| season), invite link, join, home |
| Brackets | Full tree entry, submit, lock, settled colour |
| Standings | Event + season tables, movement |
| Daily Check | Morning / live / evening computed pulse |
| Between tournaments | Designed waiting state |
| Result artifact | Shareable placement object |
| Reference | `/tournaments`, `/players` (rankings — not user directory) |
| Shell | Global nav, settings (locale + basic prefs), errors |
| Ops | Founder dashboard + disruption console (minimum) |
| i18n | English first; es/ja before public launch |

## CEO Tier 1 (on top of the loop — see FEATURE-PRIORITIES)

Pick Confidence · Bracket Health · Biggest Miss · Perfect Picks Remaining · Live Leaderboard Movement · League Highlights · Daily Recap

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
