# Data Model (initial)

Logical model for Launch MVP. Migrations live under `supabase/migrations/`.

## Core entities

| Entity | Purpose |
|---|---|
| `profiles` | Member identity (display_name, locale) |
| `preferences` | time_zone and prefs |
| `tournaments` | Reference calendar (name, surface, starts_on, lock) |
| `draws` / `draw_seats` | Bracket topology + seeds |
| `leagues` | Social object: name, format (`single` \| `season`), visibility |
| `league_members` | Membership |
| `league_invites` | Token for `/join/[token]` |
| `brackets` | Member picks for a league tournament |
| `bracket_snapshots` | Frozen grades after settlement |
| `standings` | Event + season aggregates |
| `daily_check_log` | Computed / stored Daily Check payloads |
| `platform_events` | Append-only ingest events |

## Scoring (domain)

From wireframe fidelity notes / `packages/core` intent:

- Weight doubles each round from 1.
- Naming the champion pays the final's weight again.
- A 128-draw tops out at **512**.

CEO Tier 1 adds **pick confidence** as metadata (and possibly weighted miss display) without breaking base grade integrity.

## Integrity constraints

- Lock triggers: no pick mutation after lock instant.
- RLS: members see only their leagues; pick secrecy until lock.
- Fan pick percentages (Tier 2) only after lock or after the viewer has picked.

## Fixture strategy (early phases)

Use a deterministic US Open–sized fixture (fictional player names) until RapidAPI import is wired. Spec data pattern: `Wireframe/.../matchread-spec/js/data.js`.
