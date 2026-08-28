# Data flows

How work moves through the repo. Pair with [data-model.md](./data-model.md) for entities and [modules/](./modules/) for owners.

---

## A. Provider → database (facts ingest)

```text
pg_cron / GitHub / ops script
        │  POST /functions/v1/sync-facts  (INGEST_SECRET)
        ▼
sync-facts (Edge)
        │  packages/provider-rapidapi
        ├─ calendar upsert → tournaments
        ├─ official seats → classifyDraw (reject qualifying) → integrity → apply-draw
        │       → players, seats, matches, schedule, published_at?
        │       → integrity fail: wipe seats, leave draw pending (no public sheet)
        ├─ results + live finished → apply-results
        │       → Shape A bind/fill winners; Shape B create/fill R0 from
        │         results archive + official seats (fail closed)
        │       → winner / void, claim_settlement, parent advance
        │       → conflict: settled winner ≠ provider → audit, no overwrite
        └─ refresh_lock_at (min timed R0 scheduled_at)
```

**Entry:** `supabase/functions/sync-facts/index.ts`  
**Persist:** `_shared/apply-draw.ts`, `_shared/apply-results.ts` (findMatch prefers `match_key` over stale `provider_match_id`)  
**Provider:** `packages/provider-rapidapi` (`official/classify-draw.js`, `parse-draw.js`)

---

## B. Public discovery (read path)

```text
apps/web pages
  → lib/tournaments/calendar.ts
  → public_calendar (view)
  → bracket UI only if published_at + official seats (hasDraw)
  → else: draw pending / countdown / announced matchups only
```

**Entry:** `apps/web/app/page.tsx`, `app/tournaments/[ref]/page.tsx`  
**Rule:** never invent a bracket; never render seats when `published_at` is null.  
**Detail page:** `hasDraw` counts seats by `position` (seats have no `id`); bracket uses `published_at` + loaded seats.  
**Freshness:** `AppShell` → `LiveRefresh` (~45s) re-fetches RSC from Postgres; facts
still arrive on sync-facts cron (~5m).

---

## C. Auth → league → picks

```text
Sign-in (magic link / OAuth)
  → auth/callback + middleware session refresh
  → profile / display name

Solo:  /enter/[ref]  → ensure_solo_league RPC
Group: create_league / join_with_invite RPCs

Bracket editor
  → actions/brackets.ts → save_picks RPC
  → submit_bracket when complete (draw_size - 1 picks)

Blocked when picks_are_locked:
  commissioner league_tournaments.locked_at
  OR (lock_at <= now() AND draw_is_official)
```

**Entry:** `apps/web/app/actions/brackets.ts`, `app/actions/leagues.ts`  
**Gate:** Postgres RPCs in `0006_rls_and_rpcs.sql` (not UI-only).

---

## D. Settlement (score product)

```text
Matches get settled_at + winner/void (facts path A)
        │
        ▼
settle-leagues Edge (cron ~15m)
  → grade submitted brackets (Edge copy of core grade)
  → update brackets.points / rank

Alternate: commissioner/founder settleLeagueTournament
  → apps/web/app/actions/settlement.ts + @matchread/core in-process

UI: Daily Check (pulse), standings, result breakdown
```

**Entry:** `supabase/functions/settle-leagues/index.ts`  
**Math:** `packages/core` (`grade.ts` / `scoring.ts`); Edge uses `_shared/core.js` copy.

---

## E. Lock timeline

```text
1. First timed main-draw R0 ball written → refresh_lock_at → tournaments.lock_at
2. Optional early close: commissioner lock_league_event
3. After lock + official draw: save_picks / submit_bracket refuse writes
```

Date-only schedule rows do **not** set `lock_at`.

---

## F. Trust / eligibility (what users can see)

```text
tournaments.tier + tour + product_override(force_off only)
  → bracket_eligible (generated / policy)
  → public_calendar filters to eligible rows
  → new brackets only if bracket_eligible (DB trigger)
```

Demoting an event stops discovery; existing brackets are not cascade-deleted (settlement can continue).

---

## Quick “who calls whom”

| From | To | Why |
|------|----|-----|
| Cron / Vault | `sync-facts` | Keep calendar, draws, results fresh |
| Cron | `settle-leagues` | Score submitted brackets |
| Web RSC | `public_calendar`, seats, matches | Show official field |
| Web actions | Product RPCs | Create leagues, save picks |
| Ops `publish:draws` | sync-facts / apply path | Manual verified publish |
| CI | `ci:consumer-boundary` | Guard public read surface |
