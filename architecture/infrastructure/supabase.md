# Infrastructure: Supabase database

**Path:** `supabase/migrations/`, `supabase/tests/`  
**Role:** Schema, RLS, security-definer RPCs, views, and pg_cron → Edge invoke helpers.

Hosted Supabase is the system of record. Local Docker runs the **web app only**; DB/Auth/API stay hosted (or CLI outside Compose).

## Migration chain (live)

| # | File theme |
|---|------------|
| 0001 | Profiles ↔ auth.users |
| 0002 | Tournaments, players, seats; `draw_is_official` |
| 0003 | Matches; `refresh_lock_at` |
| 0004 | Leagues, members, invites, league_tournaments |
| 0005 | Brackets, picks, `season_points` |
| 0006 | RLS + product RPCs (`save_picks`, `create_league`, …) |
| 0007 | Cron helpers (settle + legacy) |
| 0008 | Member invite RPCs (kick/leave/reissue) |
| 0009 | Cron → `sync-facts` every 5m |
| 0010–0011 | Calendar uniqueness / solo naming |
| 0012 | Draw revisions, event_map |
| 0013 | Trust boundary, tier, ops_events, repair audit |
| 0014 | `main_draw_starts_on` vs week `starts_on` |
| 0015 | `settlement_claims` |
| 0016 | `force_off`-only override; `public_calendar` |
| 0017 | Publish requires integrity report |
| 0018 | Restore product `main_draw_starts_on` after calendar overwrite |
| 0019 | Publish trigger uses `is_bracket_product()` (generated column null in trigger) |
| 0020 | Clear misclassified WTA US Open qualifying seats for main rediscovery |

`migrations/archive/` is superseded history — do not treat as live.

## RLS mental model

| Domain | Select | Write |
|--------|--------|-------|
| Facts (`tournaments`, `players`, `seats`, `matches`) | anon + authenticated | service_role / security definer only |
| Product (leagues, members, brackets, picks, invites) | authenticated members | Via RPCs as definer |
| Ops (`ops_events`, repairs, claims, integrity) | authenticated (mostly) | Mostly service |
| `public_calendar` | anon + authenticated | View (eligible only) |

## Important RPCs / functions

Product (examples from 0006 / 0008 / 0011):

- `save_picks`, `submit_bracket`
- `create_league`, `ensure_solo_league`, `join_with_invite`
- `lock_league_event`, member invite CRUD

Facts / settle:

- `draw_is_official`, `refresh_lock_at`
- `claim_settlement`, `unwind_settlement_parent`
- `is_bracket_product`

## Cron

1. `sync-facts-5m` → `invoke_sync_facts()` (Vault: project URL + ingest secret) → POST Edge.
2. `settle-leagues` on a longer cadence (0007).

See also [edge-functions.md](./edge-functions.md).

## Tests

- `npm run test:db` → `npx supabase test db`
- SQL tests under `supabase/tests/` (eligibility, reconciliation, event dates, lock write, …)

## Related

- ERD: [../data-model.md](../data-model.md)  
- Flows: [../data-flows.md](../data-flows.md)
